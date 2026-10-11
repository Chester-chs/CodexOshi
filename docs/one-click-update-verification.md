# One-click update verification

Date: 2026-10-11. Application: Codi 0.2.0. Plugin registration remains 0.1.0 so the installed MCP cache path stays compatible.

## Behavior

- Codi Settings shows **Update now** only for a newer version. Progress, failures, retry, and completion are localized; repeated clicks cannot start concurrent installations.
- The main process selects the fixed GitHub repository and pins metadata and archive to one commit. Renderer input cannot select a URL, version, command, or destination.
- Public HTTPS downloads are bounded; private access uses the existing GitHub CLI login with `--hostname github.com`. No credentials are read or exposed by Codi.
- ZIP validation precedes extraction and rejects traversal, symlinks, case collisions, reserved Windows paths, and oversized archives.
- Dependencies are prepared before shutdown. The native launcher disposes its child job and releases its mutex before starting the updater.
- Installed releases are isolated from the source checkout. Runtime, cache files, receipt, and existing startup actions are backed up. Existing MCP registration, artwork, preferences, and startup opt-out are preserved.
- Restart health requires fresh launcher, supervisor, and Electron diagnostics when Codex is running. Failure restores the old installation. Interrupted transactions can be recovered after restart or from a still-running UI.

## Checks

- `scripts/verify.ps1 -Native`: **164/164 passed**, plus 10 real Electron fail-closed shape cases (1 DIP region).
- `tests/update-download.test.cjs`: fixed commit selection, network limits, private access, cancellation, and actual Windows PowerShell ZIP extraction.
- `tests/update-service.test.cjs` and `tests/update-ipc.test.cjs`: staged handoff, trusted renderer boundary, duplicate requests, preparation failure, cancellation, disk-write failure, and dead-worker recovery.
- `tests/update-worker.test.cjs`: real filesystem transactions with process/task boundaries substituted; rollback, interruption, terminal replay, MCP preservation, startup opt-out, and stale health rejection.
- `tests/update-worker-native.test.cjs`: compiled Windows launcher, real child job, hidden updater, mutex release, replacement supervisor, and interrupted handoff recovery.
- `tests/Invoke-NewsSmoke.ps1`: hidden Electron UI with synthetic releases and updater IPC substituted; never performs a live installation.
- `tests/Invoke-CardSmoke.ps1` and `tests/Invoke-ResidentSmoke.ps1` followed by `-Restart`: existing settings, dialogue, docking, size, and visible-switch regressions.

The README screenshot uses synthetic versions. A real future release cannot be installed before it exists; live deployment of this first updater is a bootstrap, separate from the isolated update/rollback tests. User artwork is not included in test artifacts.

Bootstrap result: 223/223 installed source files matched; all 7 artwork/preference files kept their hashes. The live widget reported application 0.2.0, remained visible without focus, and retained its 300 × 253 placement. The existing login task was refreshed to the launcher supporting update handoff.
