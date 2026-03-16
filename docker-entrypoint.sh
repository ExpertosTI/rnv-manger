#!/bin/sh

echo "🔧 Database URL: ${DATABASE_URL:0:50}..."

# Wait for database to be ready
echo "⏳ Waiting for database..."
max_retries=30
count=0

if command -v pg_isready >/dev/null; then
  until pg_isready -d "$DATABASE_URL"; do
    echo "zzz Waiting for database connection..."
    sleep 2
    count=$((count+1))
    if [ $count -ge $max_retries ]; then
      echo "❌ Timeout waiting for database"
      break # Don't exit, try prisma anyway
    fi
  done
fi

# Run migrations (fail if error)
echo "🔧 Running database migrations..."
prisma migrate deploy --schema=/app/prisma/schema.prisma || {
    echo "❌ Migration failed! Exiting..."
    exit 1
}

# Run seed script (optional)
echo "🌱 Seeding initial data..."
node /app/prisma/seed.js || {
    echo "⚠️ Seeding failed. Continuing..."
}

echo "✅ Starting server..."
exec node server.js
