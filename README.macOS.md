# CodexOshi macOS adaptation

This local experimental port retains the original UI, portraits, quota reader,
and local token charts. It does not modify the Codex application or register a
Windows MCP service. macOS data is stored separately in
`${CODEX_HOME:-$HOME/.codex}/codexoshi-macos`.

## Run

Requires macOS, Node.js 24+, and Xcode Command Line Tools.

```sh
sh scripts/install-macos.sh
sh scripts/start-macos.sh
```

After installation, `Start-CodexOshi.command` also starts the application.
Press Control-C in the launch terminal to stop it.

Without Accessibility permission, the overlay uses the primary desktop work
area. To follow Codex, allow `desktop/macos/window-observer` in System Settings
> Privacy & Security > Accessibility. The helper polls the first non-minimized
Codex window and hides the overlay when Codex is closed, hidden, or minimized.
It never requests screen recording or captures other apps.

The first launch shows a placeholder. Use the gear to upload your portrait.
The overlay is transparent and uses cursor-region hit testing on macOS because
Electron setShape is unavailable there. Multi-monitor, Spaces, fullscreen and
click-focus behavior still require manual acceptance testing.

Windows self-update is disabled on macOS so that it cannot overwrite this port.
Login auto-start and signed DMG distribution are not implemented. The original
Windows PowerShell tests require Windows; their failures on macOS do not verify
Windows compatibility.

## Validation status

On Apple Silicon, the native observer compiles and reports missing Accessibility
permission correctly. An Electron smoke run rendered the placeholder, quota bar
and settings gear. A subsequent normal launch reported a visible window and
successfully read quota through the Codex app-server RPC. The 34 focused tests
for window state parsing, portraits, sounds, quota and token accounting pass.

Accessibility-authorized following, clicks, dragging, multiple monitors and
Spaces/fullscreen behavior still require interactive acceptance testing.
This is an experimental source port, not a signed or notarized macOS release.
