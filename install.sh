#!/bin/bash
# RNV Manager - Instalador Rapido
# Ejecutar: curl -sSL https://raw.githubusercontent.com/ExpertosTI/rnv-manger/main/install.sh | bash

echo "=================================="
echo "  RNV Manager - Instalacion"
echo "=================================="

# Clonar repo
git clone https://github.com/ExpertosTI/rnv-manger.git rnv-manager
cd rnv-manager

# Copiar .env
cp env.template .env
echo "[OK] Configuracion copiada"

docker compose up -d --build

echo ""
echo "=================================="
echo "  Instalacion Completada!"
echo "=================================="
echo "Accede a: http://localhost:4200"
echo ""