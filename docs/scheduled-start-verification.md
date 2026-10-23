# Scheduled monitor startup regression

User journey: reopen Codex without losing an enabled widget; preserve monitor availability across update handoff. No separate plan document was used.

## Evidence

- Local incident: enabled state was true, the monitor processes were gone, and the registered Windows task was Ready. Starting the existing task restored a visible, attached 0.3.10 widget. The OS had not rebooted during the incident.
- RED (`9e3b2cf`): `node --test tests/scheduled-start.test.cjs` failed three scheduler-routing cases and passed two startup opt-out cases. The implementation used `Start-Process` even when a startup task existed.
- GREEN (`fff0c14`): scheduler routing and update-worker checks passed, 18/18.
- RED (`975a256`): the additional explicit task-isolation case failed with `Wrong lookup task`.
- GREEN: all six scheduler-routing cases and `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/scheduled-start-native.ps1` passed. The native fixture confirms that the monitor survives its short-lived caller and its replacement survives the update worker. It also checks that the production task action is unchanged.
- Full verification: `scripts/verify.ps1 -Native` passed all 272 tests, the isolated scheduled-start fixture, responsive pin checks, four lifecycle scenarios, and ten real Electron shape checks.

## Scope and limitations

The native fixture uses a unique temporary task, a compiled production launcher, and a synthetic supervisor. It does not close the user's Codex window. The actual widget was restored through its production task and reported fresh, visible, attached state. Explicit startup opt-outs retain manual process startup.

The PowerShell branches are exercised by the six behavioral tests; percentage-based PowerShell coverage is not configured, so no coverage percentage is claimed. Existing JavaScript/Electron regression checks run through `scripts/verify.ps1 -Native`.

An early test used function wrappers around Task Scheduler and module autoloading bypassed part of that isolation. The production action was restored immediately. The final fixture passes its unique task name directly and checks the production action before and after; it does not use scheduler-command wrappers.
