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
cp .env.example .env
echo "[OK] Configuracion copiada"

# Iniciar con Docker
docker-compose up -d

echo ""
echo "=================================="
echo "  Instalacion Completada!"
echo "=================================="
echo "Accede a: http://localhost:4200"
echo ""