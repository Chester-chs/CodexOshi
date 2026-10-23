# Responsive widget and accessible pin implementation plan

**Goal:** Shrink portrait and quota bar together with the host window; expose pin beside settings and keep the pinned placement near the lower-right window edge.
**Architecture:** Reuse existing persisted dock preference and IPC. Scale against the current display work area in DIP. Keep the same 24 DIP outer margin for pinned layout and the disabled launcher. Window scaling applies in both pinned and free modes.
**Tech stack:** Electron, JavaScript, existing Node test runner and native smoke fixtures.
**Spec:** User approved the external pin beside the gear, then clarified that pinned placement should stay near the window bottom-right and unpinning must not enlarge the widget.

## Constraints and review focus
- Preserve current 0.3.8 fixes, settings, free position, right margin and transparent hit regions.
- One uniform scale for portrait and footer, including compact-only mode; display DPI and moving between displays must not compound scale.
- Pin must work with settings closed, display checked state, persist, and not trigger dialogue or dragging.
- Use 24 DIP right and bottom margins. No extra composer reservation; this follows the latest user clarification.
- Test small windows, full-size restoration, failed saves, free-mode position, and narrow footer controls.

## Steps
- [x] Add regressions for scaling on large monitors, compact-only shrinking, and outer margin; observe failures.
- [x] Implement display-relative scaling and pinned outer margin in geometry/main; update old placement expectations.
- [x] Move existing checkbox to a visible pin next to gear; preserve preference persistence and suppress parent gestures.
- [x] Exercise real Electron UI at large/small sizes, pin/unpin and narrow widths; inspect captures.
- [x] Run full checks, review diff, apply locally with backup and verify current installation.
