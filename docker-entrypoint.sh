#!/bin/sh

echo "🔧 Database URL: ${DATABASE_URL:0:50}..."

# Try to run migrations, but don't fail if they error
echo "🔧 Running database migrations..."
npx prisma migrate deploy --schema=/app/prisma/schema.prisma || {
    echo "⚠️ Migration failed or no migrations needed. Continuing..."
}

echo "✅ Starting server..."
exec node server.js
