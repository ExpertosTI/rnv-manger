#!/bin/sh
set -e

echo "[RNV] Running database migrations..."
npx prisma migrate deploy

echo "[RNV] Starting application..."
exec node server.js
