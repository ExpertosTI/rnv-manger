#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="rnv-manager"
BRANCH="deploy/rnv-manager"
REPO_URL="https://github.com/ExpertosTI/rnv-manger.git"
WORKDIR="/opt/rnv-manager"
ENV_FILE="/etc/rnv-manager/rnv.env"
NETWORK_PUBLIC="RenaceNet"
NETWORK_INTERNAL="rnv_internal"

echo "RNV Manager deploy"

if ! command -v docker >/dev/null 2>&1; then
    echo "docker no disponible"
    exit 1
fi

if ! command -v git >/dev/null 2>&1; then
    echo "git no disponible"
    exit 1
fi

if ! docker info --format '{{.Swarm.LocalNodeState}}' 2>/dev/null | grep -qi active; then
    docker swarm init
fi

if ! docker network inspect "$NETWORK_PUBLIC" >/dev/null 2>&1; then
    docker network create --driver overlay --attachable "$NETWORK_PUBLIC"
fi

if ! docker network inspect "$NETWORK_INTERNAL" >/dev/null 2>&1; then
    docker network create --driver overlay --attachable "$NETWORK_INTERNAL"
fi

if [ -d "$WORKDIR/.git" ]; then
    git -C "$WORKDIR" fetch origin
    git -C "$WORKDIR" checkout "$BRANCH"
    git -C "$WORKDIR" pull origin "$BRANCH"
else
    mkdir -p "$(dirname "$WORKDIR")"
    git clone --branch "$BRANCH" "$REPO_URL" "$WORKDIR"
fi

if [ ! -f "$ENV_FILE" ]; then
    mkdir -p "$(dirname "$ENV_FILE")"
    cp "$WORKDIR/deploy/rnv.env.example" "$ENV_FILE"
    echo "Edita $ENV_FILE y vuelve a ejecutar"
    exit 1
fi

set -a
. "$ENV_FILE"
set +a

docker build -t rnv-manager:latest "$WORKDIR"

docker stack deploy -c "$WORKDIR/deploy/stack.yml" "$STACK_NAME"

docker service ls --filter "name=${STACK_NAME}_"
