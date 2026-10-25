# Complete quota percentage regression

Journey derived from the user's screenshot: a full quota must display `100%` in the resident footer, without ellipsis, overlap or a change to the portrait/footer dimensions.

## RED and GREEN

- RED checkpoint `e1a589c`: `node tests/footer-percent-native.cjs` exercised the real production renderer with isolated data and synthetic quota. Twenty of 216 combinations failed. In a 199px footer, the numeric element was 30px wide while `100%` required 35px.
- GREEN checkpoint `951f712`: the same command passed all 216 combinations after disabling numeric flex shrink and reserving three digit widths plus the percent-sign budget.
- Later test refinements also check that the footer stays within the fixture widget and that the percentage, pin and settings controls do not overlap. The regression is included in `scripts/verify.ps1 -Native`.

## Validation

| Guarantee | Command and result |
|---|---|
| Complete 0%, 99% and 100%; controls stay in bounds | `node tests/footer-percent-native.cjs`: 216/216 passed |
| Chinese/English, fresh/stale data, nine footer widths from 118px to 420px, 50%/100% resident scale | Same production-renderer matrix |
| Pin toggling, window scaling and input-box avoidance still work | `node tests/responsive-pin-native.cjs`: passed |
| Existing automated regressions and source-file checks | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify.ps1`: 276/276 tests passed |

Only two production CSS declarations changed. No new JavaScript or native behavior was added. CSS coverage percentages are not configured; the evidence is the executed browser layout matrix. The fixture does not read account credentials or modify the user's characters/settings. Screenshot-based visual comparison and other OS font configurations were not tested.
