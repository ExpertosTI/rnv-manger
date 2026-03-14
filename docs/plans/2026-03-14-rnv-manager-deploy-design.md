## Objetivo
Desplegar RNV Manager en Linux con Docker Swarm, Traefik y configuración segura desde Git.

## Alcance
- Stack Swarm con Postgres, app y backup diario.
- Deploy desde una rama dedicada del repo con build local en servidor.
- Variables sensibles fuera del repo y cargadas desde un archivo del sistema.

## Arquitectura
- Swarm con red interna overlay para db y backup.
- Red externa RenaceNet para Traefik.
- Imagen local rnv-manager:latest construida en el servidor.

## Flujo de despliegue
- Inicializar Swarm y redes necesarias.
- Clonar o actualizar el repo y la rama deploy.
- Generar variables automáticamente en /etc/rnv-manager/rnv.env si no existe.
- Construir imagen y desplegar stack.

## Backups
- Servicio dedicado con pg_dump diario.
- Retención de 7 archivos en volumen rnv_manager_backups.

## Seguridad
- Variables sensibles en archivo del servidor, no en Git.
- Tráfico HTTPS gestionado por Traefik y Let’s Encrypt.

## Verificación
- docker service ls para verificar estado.
- Acceso por https://rnv.renace.tech.
