#!/usr/bin/env bash
set -e

echo "🍏 Compilando App nativa de macOS para RNV Manager..."

export PATH="$HOME/.cargo/bin:$PATH"

if ! command -v cargo &> /dev/null; then
    echo "❌ Error: Cargo / Rust no encontrado en PATH ($HOME/.cargo/bin)."
    exit 1
fi

echo "🦀 Rust versión: $(cargo --version)"

# 1. Compilar bundle nativo con Tauri
npx tauri build

# 2. Copiar artefactos a dist-mac/
mkdir -p dist-mac

APP_DIR="src-tauri/target/release/bundle/macos"
DMG_DIR="src-tauri/target/release/bundle/dmg"

if [ -d "$APP_DIR" ]; then
    cp -R "$APP_DIR"/*.app dist-mac/ 2>/dev/null || true
fi

if [ -d "$DMG_DIR" ]; then
    cp "$DMG_DIR"/*.dmg dist-mac/ 2>/dev/null || true
fi

echo "✅ Compilación de macOS completada exitosamente en dist-mac/:"
ls -lh dist-mac/
