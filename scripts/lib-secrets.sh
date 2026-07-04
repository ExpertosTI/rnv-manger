#!/usr/bin/env bash
# Carga segura de secrets.local (sin source — evita archivos corruptos con ANSI)
set -euo pipefail

SECRETS_WARN() { echo -e "\033[1;33m$*\033[0m" >&2; }

secrets_is_corrupt() {
    local f="$1"
    [ -f "$f" ] || return 1
    grep -q $'\033\|\\033\|33mSMTP\|mSMTP_PASS' "$f" 2>/dev/null
}

# Lee solo líneas KEY=VALUE válidas. Devuelve 1 si el archivo está corrupto.
secrets_load_safe() {
    local f="$1"
    [ -f "$f" ] || return 0
    if secrets_is_corrupt "$f"; then
        SECRETS_WARN "⚠️  $f corrupto (ANSI) — se ignorará y se regenerará"
        return 1
    fi
    local line key val
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line//$'\r'/}"
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
        key="${BASH_REMATCH[1]}"
        val="${BASH_REMATCH[2]}"
        # Quitar comillas envolventes simples/dobles
        val="${val%\"}"; val="${val#\"}"
        val="${val%\'}"; val="${val#\'}"
        export "$key=$val"
    done < "$f"
    return 0
}

secrets_quarantine_if_corrupt() {
    local f="$1"
    [ -f "$f" ] || return 0
    if secrets_is_corrupt "$f"; then
        mv -f "$f" "${f}.corrupt.$(date +%s)" 2>/dev/null || rm -f "$f"
        SECRETS_WARN "⚠️  $f movido/eliminado por corrupción"
    fi
}
