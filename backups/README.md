# Backups Directory
This folder contains database backups created automatically or manually.

## Automatic Backups
The backup service runs daily and keeps the last 7 backups.

## Manual Backup
```bash
./deploy.sh backup
```

## Restore
```bash
./deploy.sh restore backups/filename.dump
```

## Backup Location
Backups are stored as PostgreSQL custom format (`.dump`) files.
