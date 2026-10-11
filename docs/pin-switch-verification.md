# Codi 0.2.7 — pin switch state

The pin switch now starts disabled until the saved preference is loaded. While a change is saving, older layout updates cannot visually undo the click. The switch stays disabled until the save resolves; a failed save restores the last saved choice and reports the error. Pinning still moves the visible portrait and footer to the Codex window's right edge, and the original manual position remains available after unpinning.

The new control regression was observed failing against 0.2.6 before the fix. It covers an initially saved free position, a pin click while the save is pending, and an older layout arriving during that save. A hidden Electron fixture uses actual mouse events to toggle free and pinned modes and checks the saved choice and the resulting right edge.
