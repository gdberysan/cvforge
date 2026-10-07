#!/usr/bin/env bash
# CVForge — terminal start script.
#
# In the packaged folder this file lives in programa/ next to servidor/ and
# runs the prebuilt server with the system Node (the Linux path; macOS and
# Windows users double-click CVForge instead). In a dev checkout there is
# no servidor/ and it installs, builds and starts from source.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js no está instalado / Node.js is not installed."
  echo "Descárgalo (LTS) en / Download it (LTS) at: https://nodejs.org"
  read -r -p "Enter para salir / to exit…" _
  exit 1
fi
MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$MAJOR" -lt 20 ]; then
  echo "Node.js $MAJOR es muy antiguo; se necesita 20 o superior / Node.js 20+ required."
  read -r -p "Enter para salir / to exit…" _
  exit 1
fi

# The first free port from 3000 up, unless PORT pins one. Connection refused
# (curl exit 7) is the only proof a port is free.
if [ -z "${PORT:-}" ]; then
  for p in 3000 3001 3002 3003 3004 3005 3006 3007 3008 3009; do
    rc=0
    curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$p/" 2>/dev/null || rc=$?
    if [ "$rc" -eq 7 ]; then PORT="$p"; break; fi
  done
  if [ -z "${PORT:-}" ]; then
    echo "No hay un puerto libre entre 3000 y 3009 / No free port between 3000 and 3009."
    exit 1
  fi
fi

if [ -d servidor ]; then
  # Packaged layout: programa/servidor beside this script, user data one
  # level up in datos/, next to LEEME.html.
  ROOT="$(cd .. && pwd)"
  mkdir -p "$ROOT/datos"
  ( sleep 3; open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null || true ) &
  echo
  echo "CVForge → http://localhost:$PORT   (Ctrl+C para detener / to stop)"
  echo
  cd servidor
  exec env HOSTNAME=127.0.0.1 PORT="$PORT" CVFORGE_DB_PATH="$ROOT/datos/cvforge.db" node server.js
fi

# Dev checkout: install, build, start from source.
if [ ! -d node_modules ]; then
  echo "→ Instalando dependencias (solo la primera vez) / Installing dependencies (first run only)…"
  npm ci --no-audit --no-fund
fi
# Gate on BUILD_ID, not the directory: a failed build still creates .next,
# and gating on the directory would skip the rebuild forever afterwards.
if [ ! -f .next/BUILD_ID ] || [ package.json -nt .next/BUILD_ID ]; then
  echo "→ Compilando (solo la primera vez) / Building (first run only)…"
  npm run build
fi

mkdir -p data
( sleep 3; open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null || true ) &
echo
echo "CVForge → http://localhost:$PORT   (Ctrl+C para detener / to stop)"
echo
npm start
