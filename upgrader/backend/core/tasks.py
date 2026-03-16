from celery import shared_task
import time
import os
import redis
import json
import zipfile
import docker
import subprocess
import io
import tarfile
import gzip

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
redis_client = redis.from_url(REDIS_URL)
UPLOAD_DIR = "/workdir"

try:
    docker_client = docker.from_env()
except Exception:
    docker_client = None

ODOO_CONF_CONTENT = """[options]
admin_passwd = upgradernc_master_password
db_host = host.docker.internal
db_port = 5432
db_user = odoo
db_password = odoo
addons_path = /opt/odoo/addons,/opt/openupgrade
data_dir = /var/lib/odoo
list_db = True
proxy_mode = True
workers = 0
"""

DOCKERFILE_TEMPLATE = """ARG ODOO_VERSION=18.0
FROM python:3.12-slim

ARG ODOO_VERSION
ENV ODOO_VERSION=${ODOO_VERSION}

RUN apt-get update && apt-get install -y --no-install-recommends \\
    postgresql-client \\
    build-essential \\
    libpq-dev \\
    libxml2-dev \\
    libxslt1-dev \\
    libldap2-dev \\
    libsasl2-dev \\
    libjpeg-dev \\
    zlib1g-dev \\
    git \\
    wkhtmltopdf \\
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt

RUN git clone --depth 1 -b ${ODOO_VERSION} https://github.com/odoo/odoo.git /opt/odoo
RUN pip install --no-cache-dir -r /opt/odoo/requirements.txt
RUN git clone --depth 1 -b ${ODOO_VERSION} https://github.com/OCA/OpenUpgrade.git /opt/openupgrade
RUN pip install --no-cache-dir openupgradelib

RUN mkdir -p /etc/odoo
COPY odoo.conf /etc/odoo/odoo.conf

ENTRYPOINT ["python", "/opt/odoo/odoo-bin", "-c", "/etc/odoo/odoo.conf"]
"""


def publish_log(session_id: str, message: str, type: str = "log", status: str = None, progress: int = None):
    payload = {"type": type, "message": message}
    if status:
        payload["status"] = status
    if progress is not None:
        payload["progress"] = progress
    redis_client.publish(f"logs_{session_id}", json.dumps(payload))


def wait_for_pg_ready(container, max_retries=20, delay=2):
    """Wait until PostgreSQL is ready to accept connections."""
    for i in range(max_retries):
        exit_code, _ = container.exec_run(
            ["pg_isready", "-U", "odoo"],
            demux=True
        )
        if exit_code == 0:
            return True
        time.sleep(delay)
    return False


def cleanup_container(name):
    """Safely remove a container by name if it exists."""
    if not docker_client:
        return
    try:
        c = docker_client.containers.get(name)
        c.remove(force=True)
    except Exception:
        pass


def build_openupgrade_image(version: str):
    if not docker_client:
        return False, "Docker client unavailable"
    tar_stream = io.BytesIO()
    with tarfile.open(fileobj=tar_stream, mode="w") as tar:
        dockerfile_bytes = DOCKERFILE_TEMPLATE.encode("utf-8")
        dockerfile_info = tarfile.TarInfo("Dockerfile")
        dockerfile_info.size = len(dockerfile_bytes)
        tar.addfile(dockerfile_info, io.BytesIO(dockerfile_bytes))
        conf_bytes = ODOO_CONF_CONTENT.encode("utf-8")
        conf_info = tarfile.TarInfo("odoo.conf")
        conf_info.size = len(conf_bytes)
        tar.addfile(conf_info, io.BytesIO(conf_bytes))
    tar_stream.seek(0)
    try:
        docker_client.images.build(
            fileobj=tar_stream,
            custom_context=True,
            tag=f"upgradernc/openupgrade:{version}",
            buildargs={"ODOO_VERSION": version},
            rm=True,
        )
        return True, None
    except Exception as e:
        return False, str(e)[:400]


@shared_task(bind=True)
def start_migration_task(self, session_id: str, source_version: str, target_version: str):
    """
    Core migration orchestration task.
    Extracts the backup, restores into an ephemeral PostgreSQL container,
    runs OpenUpgrade for each version hop, then exports the migrated database.
    """
    publish_log(session_id, f"Iniciando flujo orquestado para la sesión {session_id}...", "info", progress=5)
    publish_log(session_id, f"Plan: {source_version} -> {target_version}", progress=10)

    # ==========================================================================
    # PHASE 1: Extract the ZIP backup
    # ==========================================================================
    session_dir = os.path.join(UPLOAD_DIR, session_id)
    zip_path = os.path.join(session_dir, "backup.zip")
    extract_dir = os.path.join(session_dir, "extracted")

    publish_log(session_id, "Descomprimiendo archivo ZIP enviado por el cliente...", progress=15)
    try:
        os.makedirs(extract_dir, exist_ok=True)
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)

        dump_sql = os.path.join(extract_dir, "dump.sql")
        dump_format = "plain"
        if not os.path.exists(dump_sql):
            candidates = []
            fallbacks = []
            all_files = []
            for root, dirs, files in os.walk(extract_dir):
                dirs[:] = [d for d in dirs if d.lower() != "filestore"]
                for f in files:
                    lower = f.lower()
                    path = os.path.join(root, f)
                    all_files.append(path)
                    if lower in ("dump.sql", "dump.sql.gz", "dump.dump", "dump.backup", "dump.pgdump", "dump"):
                        candidates.insert(0, path)
                    elif lower.endswith(".sql") or lower.endswith(".sql.gz"):
                        candidates.append(path)
                    elif lower.endswith(".dump") or lower.endswith(".backup") or lower.endswith(".pgdump"):
                        candidates.append(path)
                    elif "dump" in lower:
                        fallbacks.append(path)
            if not candidates and fallbacks:
                candidates = fallbacks
            if candidates:
                dump_sql = candidates[0]
            else:
                sample = [os.path.relpath(f, extract_dir) for f in all_files[:15]]
                publish_log(session_id, f"Error: No se encontró dump en el ZIP. Archivos: {sample}", "error", status="error")
                return {"status": "error", "error": "dump.sql not found in zip"}

        if dump_sql.lower().endswith(".gz"):
            base_name = os.path.basename(dump_sql[:-3])
            decompressed = os.path.join(extract_dir, base_name)
            with gzip.open(dump_sql, "rb") as gz_file, open(decompressed, "wb") as out_file:
                out_file.write(gz_file.read())
            dump_sql = decompressed

        lower_dump = dump_sql.lower()
        if not lower_dump.endswith(".sql"):
            dump_format = "custom"

        publish_log(session_id, "El filestore y el dump han sido extraídos con éxito.", "success", progress=25)
    except zipfile.BadZipFile:
        publish_log(session_id, "Error: El archivo subido no es un ZIP válido.", "error", status="error")
        return {"status": "error", "error": "Bad zip file"}
    except Exception as e:
        publish_log(session_id, f"Error extrayendo ZIP: {str(e)}", "error", status="error")
        return {"status": "error", "error": str(e)}

    # ==========================================================================
    # PHASE 2: Spin up ephemeral PostgreSQL container
    # ==========================================================================
    if not docker_client:
        publish_log(session_id, "Error crítico: El cliente Docker no está disponible en el Worker.", "error", status="error")
        return {"status": "error", "error": "Docker client unavailable"}

    pg_container_name = f"pg_ephemeral_{session_id[:8]}"
    pg_container = None
    workdir_volume = os.getenv("WORKDIR_VOLUME")
    if not workdir_volume and docker_client:
        try:
            current_id = os.getenv("HOSTNAME")
            if current_id:
                current_container = docker_client.containers.get(current_id)
                for mount in current_container.attrs.get("Mounts", []):
                    if mount.get("Destination") == "/workdir":
                        workdir_volume = mount.get("Name") or mount.get("Source")
                        break
        except Exception:
            workdir_volume = None
    if not workdir_volume:
        workdir_volume = "upgradernc_workdir"

    publish_log(session_id, f"Preparando base de datos efímera (PostgreSQL 15): {pg_container_name}", progress=30)

    try:
        cleanup_container(pg_container_name)

        # DO NOT use remove=True — we need the container alive for pg_dump later
        publish_log(session_id, f"Usando volumen de workdir: {workdir_volume}", "info")
        pg_container = docker_client.containers.run(
            "postgres:15-alpine",
            name=pg_container_name,
            environment={
                "POSTGRES_USER": "odoo",
                "POSTGRES_PASSWORD": "odoo",
                "POSTGRES_DB": "odoo"
            },
            network="upgradernc_default",
            volumes={workdir_volume: {"bind": "/workdir", "mode": "rw"}},
            detach=True,
            # remove=False so we can pg_dump after migration
        )
        publish_log(session_id, f"Contenedor {pg_container_name} levantado. Esperando PostgreSQL...", progress=33)

        if not wait_for_pg_ready(pg_container):
            publish_log(session_id, "Error: PostgreSQL no respondió a tiempo.", "error", status="error")
            cleanup_container(pg_container_name)
            return {"status": "error", "error": "PostgreSQL timeout"}

        publish_log(session_id, "PostgreSQL listo. Restaurando volcado SQL...", progress=38)

        rel = os.path.relpath(dump_sql, UPLOAD_DIR)
        dump_in_container = f"/workdir/{rel.replace(os.sep, '/')}"

        if dump_format == "custom":
            exec_cmd = ["pg_restore", "-U", "odoo", "-d", "odoo", "-Fc", dump_in_container]
        else:
            exec_cmd = ["psql", "-U", "odoo", "-d", "odoo", "-f", dump_in_container]
        exit_code, output = pg_container.exec_run(exec_cmd, demux=True)

        if exit_code != 0:
            stderr = ""
            if output and output[1]:
                stderr = output[1].decode('utf-8', errors='replace')[:500]
            publish_log(session_id, f"Error restaurando BD: {stderr}", "error", status="error")
            cleanup_container(pg_container_name)
            return {"status": "error", "error": "pg_restore failed"}

        publish_log(session_id, "Base de datos restaurada con éxito en el contenedor efímero.", "success", progress=50)
    except Exception as e:
        publish_log(session_id, f"Error iniciando PostgreSQL: {str(e)}", "error", status="error")
        cleanup_container(pg_container_name)
        return {"status": "error", "error": str(e)}

    # ==========================================================================
    # PHASE 3: Run OpenUpgrade for each version hop
    # ==========================================================================
    source_major = int(float(source_version))
    target_major = int(float(target_version))
    versions_to_run = [f"{v}.0" for v in range(source_major + 1, target_major + 1)]

    if not versions_to_run:
        publish_log(session_id, "No hay saltos de versión que ejecutar.", "warning")
    else:
        total_versions = len(versions_to_run)
        for idx, version in enumerate(versions_to_run):
            progress_start = 50 + int((idx / total_versions) * 35)
            progress_end = 50 + int(((idx + 1) / total_versions) * 35)
            ok = run_openupgrade_step(session_id, version, pg_container_name, progress_start, progress_end)
            if not ok:
                cleanup_container(pg_container_name)
                return {"status": "error", "error": f"OpenUpgrade {version} failed"}

    # ==========================================================================
    # PHASE 4: Export the migrated database
    # ==========================================================================
    publish_log(session_id, f"Empaquetando nuevo volcado (Odoo {target_version}) y adjuntando filestore...", progress=88)

    try:
        migrated_dump_path = f"/workdir/{session_id}/migrated_dump.sql"
        local_dump_path = os.path.join(session_dir, "migrated_dump.sql")

        exec_cmd = ["pg_dump", "-U", "odoo", "-d", "odoo", "-f", migrated_dump_path]
        exit_code, output = pg_container.exec_run(exec_cmd, demux=True)

        if exit_code != 0:
            stderr = ""
            if output and output[1]:
                stderr = output[1].decode('utf-8', errors='replace')[:500]
            publish_log(session_id, f"Error exportando base de datos: {stderr}", "error", status="error")
            cleanup_container(pg_container_name)
            return {"status": "error", "error": "pg_dump failed"}

        # Now stop and clean up the PostgreSQL container
        cleanup_container(pg_container_name)

        publish_log(session_id, "Comprimiendo archivo final ZIP para descarga...", progress=93)

        output_zip = os.path.join(session_dir, "migrated_backup.zip")

        with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
            if os.path.exists(local_dump_path):
                zipf.write(local_dump_path, "dump.sql")
            filestore_dir = os.path.join(extract_dir, "filestore")
            if os.path.exists(filestore_dir):
                for root, dirs, files in os.walk(filestore_dir):
                    for file in files:
                        abs_file = os.path.join(root, file)
                        rel_file = os.path.relpath(abs_file, extract_dir)
                        zipf.write(abs_file, rel_file)

        publish_log(session_id, "✅ Migración completada exitosamente. Archivo listo para descarga.", "success", status="success", progress=100)
        return {"status": "success", "session_id": session_id}

    except Exception as e:
        publish_log(session_id, f"Error en exportación final: {str(e)}", "error", status="error")
        cleanup_container(pg_container_name)
        return {"status": "error", "error": str(e)}


def run_openupgrade_step(session_id: str, version: str, pg_container_name: str, progress_start: int, progress_end: int):
    """
    Runs OpenUpgrade for a single version hop.
    First tries the real Docker image, falls back to the official Odoo image with OpenUpgrade scripts.
    """
    ou_container_name = f"ou_migration_{session_id[:8]}_{version.replace('.', '')}"
    publish_log(session_id, f"*** INICIANDO OPENUPGRADE (Destino: {version}) ***", "warning", progress=progress_start)

    try:
        cleanup_container(ou_container_name)

        image_name = f"upgradernc/openupgrade:{version}"
        try:
            docker_client.images.get(image_name)
            publish_log(session_id, f"Imagen {image_name} encontrada localmente.", "info")
        except docker.errors.ImageNotFound:
            publish_log(session_id, f"Imagen {image_name} no encontrada. Intentando descargar...", "info")
            try:
                docker_client.images.pull(image_name)
                publish_log(session_id, f"Imagen {image_name} descargada exitosamente.", "success")
            except Exception:
                publish_log(session_id, "No se pudo descargar la imagen. Construyendo imagen local...", "warning")
                built, error_msg = build_openupgrade_image(version)
                if not built:
                    publish_log(session_id, f"Error construyendo imagen OpenUpgrade: {error_msg}", "error", status="error")
                    return False

        ou_container = docker_client.containers.run(
            image_name,
            name=ou_container_name,
            environment={
                "HOST": pg_container_name,
                "PORT": "5432",
                "USER": "odoo",
                "PASSWORD": "odoo",
            },
            network="upgradernc_default",
            command=[
                "-d", "odoo",
                "-u", "all",
                "--stop-after-init",
                "--db_host", pg_container_name,
                "--db_port", "5432",
                "--db_user", "odoo",
                "--db_password", "odoo",
            ],
            detach=True,
        )

        # Stream logs in real-time
        publish_log(session_id, f"Ejecutando migración v{version}... Esto puede tomar varios minutos.", "info", progress=progress_start + 2)

        step_progress = progress_start + 3
        for log_chunk in ou_container.logs(stream=True, follow=True):
            line = log_chunk.decode('utf-8', errors='replace').strip()
            if line:
                # Only show relevant lines, not every single Odoo log
                if any(keyword in line.lower() for keyword in ["error", "warning", "migration", "loading", "module", "upgrade", "openupgrade"]):
                    publish_log(session_id, f"[v{version}] {line[:200]}", progress=min(step_progress, progress_end - 2))
                    step_progress = min(step_progress + 1, progress_end - 2)

        # Wait for it to finish
        result = ou_container.wait(timeout=1800)  # 30 min timeout
        exit_code = result.get("StatusCode", -1)

        if exit_code != 0:
            publish_log(session_id, f"OpenUpgrade {version} terminó con código {exit_code}.", "error", status="error")
            tail_logs = ou_container.logs(tail=40).decode('utf-8', errors='replace')
            publish_log(session_id, f"Últimas líneas: {tail_logs[:500]}", "error")
            cleanup_container(ou_container_name)
            return False

        publish_log(session_id, f"OpenUpgrade {version} completado exitosamente.", "success", progress=progress_end)

        # Clean up OpenUpgrade container
        cleanup_container(ou_container_name)
        return True

    except docker.errors.ContainerError as e:
        publish_log(session_id, f"Error en contenedor OpenUpgrade {version}: {str(e)[:300]}", "error")
        cleanup_container(ou_container_name)
        return False
    except docker.errors.APIError as e:
        publish_log(session_id, f"Error Docker API para {version}: {str(e)[:300]}", "error")
        cleanup_container(ou_container_name)
        return False
    except Exception as e:
        publish_log(session_id, f"Error inesperado en OpenUpgrade {version}: {str(e)[:300]}", "error")
        cleanup_container(ou_container_name)
        return False
