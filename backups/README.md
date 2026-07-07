# Backups Directory
This folder contains database backups created automatically or manually.

## Automatic Backups
The backup service runs daily and keeps the last 7 backups.

## Manual Backup
```bash
./deploy.sh backup
```

## Restore

### PostgreSQL dump (full DB replace)
```bash
./deploy.sh restore backups/filename.dump
```

### JSON backup (clientes, VPS, servicios — upsert)
```bash
./deploy.sh restore-json
# o con archivo específico:
./deploy.sh restore-json backups/rnv_manager_backup_2026-03-14.json
```

También desde la UI: **Configuración → Restaurar backup incluido (mar 2026)**.

## Bundled JSON
`rnv_manager_backup_2026-03-14.json` — 6 clientes, 7 VPS, 55 servicios (marzo 2026).

## Backup Location
Backups are stored as PostgreSQL custom format (`.dump`) files.
