#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
test "$(uname -s)" = Darwin || { echo 'This installer requires macOS.'; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)' || { echo 'Node.js 24+ is required.'; exit 1; }
npm ci --no-audit --no-fund
env -u ELECTRON_SKIP_BINARY_DOWNLOAD node node_modules/electron/install.js
xcrun swiftc desktop/macos/window-observer.swift -o desktop/macos/window-observer
echo 'Installed. Start with: sh scripts/start-macos.sh'
