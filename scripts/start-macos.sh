#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DATA="${CODEX_HOME:-$HOME/.codex}/codexoshi-macos"
mkdir -p "$DATA"
if [ ! -x "$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" ]; then
  echo 'Electron is missing. Run: sh scripts/install-macos.sh'
  exit 1
fi
unset ELECTRON_RUN_AS_NODE
echo "Starting CodexOshi. Data: $DATA"
echo 'Look at the bottom-right of your desktop. Keep this terminal open; Control-C stops the widget.'
exec "$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" "$ROOT/desktop/main.cjs" --data "$DATA"
