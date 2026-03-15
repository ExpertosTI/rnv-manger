from fastapi import APIRouter, File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
import shutil
import uuid
import os
import json
import redis.asyncio as redis
from typing import Dict

from core.tasks import start_migration_task

router = APIRouter()

UPLOAD_DIR = "/workdir"
if not os.path.exists(UPLOAD_DIR):
    UPLOAD_DIR = os.path.join(os.getcwd(), "workdir")
    os.makedirs(UPLOAD_DIR, exist_ok=True)

sessions: Dict[str, dict] = {}

@router.websocket("/sessions/{session_id}/logs")
async def websocket_logs(websocket: WebSocket, session_id: str):
    await websocket.accept()
    if session_id not in sessions:
        await websocket.send_text(json.dumps({"type": "error", "message": "Session not found"}))
        await websocket.close()
        return

    redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"))
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(f"logs_{session_id}")

    await websocket.send_text(json.dumps({"type": "info", "message": "Conectado a la terminal virtual. Esperando inicio de migración...", "progress": 1}))

    try:
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if message:
                data = message['data'].decode('utf-8')
                await websocket.send_text(data)

                try:
                    json_data = json.loads(data)
                    if json_data.get("status") in ["success", "error"]:
                        break
                except json.JSONDecodeError:
                    pass
    except WebSocketDisconnect:
        print(f"Client {session_id} disconnected from logs")
    finally:
        await pubsub.unsubscribe(f"logs_{session_id}")
        await redis_client.aclose()


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are allowed")

    session_id = str(uuid.uuid4())
    session_dir = os.path.join(UPLOAD_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)

    file_path = os.path.join(session_dir, "backup.zip")

    try:
        total_bytes = 0
        with open(file_path, "wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024 * 5)  # 5MB chunks
                if not chunk:
                    break
                buffer.write(chunk)
                total_bytes += len(chunk)

        print(f"DEBUG UPLOAD: session={session_id}, transferred={total_bytes} bytes")
    finally:
        await file.close()

    sessions[session_id] = {
        "status": "uploaded",
        "file": file.filename,
        "message": "File uploaded successfully. Ready for analysis."
    }

    return {"session_id": session_id, "message": "Upload complete"}


@router.get("/sessions/{session_id}/status")
async def get_status(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return sessions[session_id]


@router.post("/sessions/{session_id}/migrate")
async def trigger_migration(session_id: str, source_version: str = "16.0", target_version: str = "18.0"):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    sessions[session_id]["status"] = "in_progress"
    sessions[session_id]["message"] = f"Migration started from {source_version} to {target_version}."

    from core.worker import celery_app
    celery_app.send_task("core.tasks.start_migration_task", args=[session_id, source_version, target_version])

    return {"message": "Migration started", "session_id": session_id}


@router.get("/sessions/{session_id}/download")
async def download_migration(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session_dir = os.path.join(UPLOAD_DIR, session_id)
    file_path = os.path.join(session_dir, "migrated_backup.zip")

    if not os.path.exists(file_path):
        # Fallback to original backup.zip if migrated doesn't exist
        file_path = os.path.join(session_dir, "backup.zip")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Migrated file not found")

    headers = {
        "Access-Control-Expose-Headers": "Content-Disposition",
        "Content-Disposition": f"attachment; filename=migrated_odoo_{session_id[:8]}.zip"
    }

    return FileResponse(
        path=file_path,
        filename=f"migrated_odoo_{session_id[:8]}.zip",
        media_type='application/zip',
        headers=headers
    )
