# Foreground hover regression

Journey derived from the reported bug: hovering over another application must not show CodexOshi quota hints, and returning to Codex must restore the widget and its first-click interaction.

## Evidence

- RED: `d695a4d` introduced the four behavioral regressions; `7d54dbe` corrected the fixture's stale-bridge clock. All four cases then failed for retained visibility or mouse forwarding.
- GREEN: `bfb5ac2` passed the four regressions and the window/bridge tests. `92f00a4` added consistent owner-chain handling and stabilized native fixture activation before sampling.
- `node --test tests/foreground-hover.test.cjs tests/window.test.cjs`: 14/14 passed.
- `powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File tests/foreground-window-native.ps1`: six real Windows ownership cases passed, including host, owned overlay/dialog, unrelated window, return to host and absent host. The fixture uses its own windows and restores the previous foreground window.
- `node tests/lifecycle-native.cjs`: all five real Electron scenarios passed. The new foreground scenario checks hidden state, disabled forwarding, a delivered mouse-leave event, continued inactivity across heartbeats, and restoration without stealing keyboard focus.
- `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1 -Native`: 276/276 tests passed, along with Windows foreground ownership, isolated scheduled-start handoff, responsive pin, five Electron lifecycle scenarios and ten native shape checks.
- `node --experimental-test-coverage --test-coverage-include=desktop/visibility.cjs --test tests/window.test.cjs tests/foreground-hover.test.cjs`: visibility module line, branch and function coverage each 100%.

## Guarantees and limits

| Guarantee | Evidence |
|---|---|
| Another foreground app cannot retain widget hover forwarding | foreground-hover behavioral tests and Electron foreground-hover scenario |
| Hidden, detached, modal and stale states disable mouse reception | foreground-hover behavioral tests |
| Returning to Codex restores normal inactive display and interaction | behavioral tests, Electron scenario and native ownership fixture |
| Native owned overlay/dialog focus remains part of the host | Windows foreground fixture |

This change applies to Windows. The macOS observer does not supply the new foreground flag; its existing behavior is preserved. Whole-project JavaScript and PowerShell coverage is not configured; the 100% result above is scoped to the visibility module. The native tests use test-owned windows rather than automating a user's browser or video page.
