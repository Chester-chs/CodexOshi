# Responsive scaling and external pin verification

Date: 2026-10-23. Base: 0.3.8 (`7e1b6b4`). Applied locally; no new release announced.

## Final behavior after user clarification

- A pin beside the footer gear toggles the existing persisted preference. Highlighted means pinned.
- The user clarified that the widget should remain near the window lower-right corner, with 24 DIP right and bottom margins. Earlier 320/132 DIP composer reservations were removed.
- Window-relative scaling applies to both pinned and free modes, including bar-only mode. Pinning changes placement only; toggling pin cannot enlarge or shrink the current widget.
- Unpinning retains and saves the current coordinates instead of restoring an older free position. User-selected dimensions remain intact. Free dragging, edge snapping, mirroring and bar-only baseline restoration use the scaled geometry.
- Narrow footers preserve the percentage, pin and gear. Stale data becomes a tooltip-labelled dot; the progress track hides at the narrowest widths.

## Verification

- Regressions first reproduced both faults: bottom margin was 132 instead of 24 DIP; unpinning changed 120x170 into 240x340 in a 1280x720 host.
- Corrected regressions cover portrait and bar-only pin toggles, subsequent free-mode resizing, repinning, full-size restoration, display-reference changes and original dimension preservation.
- Real Electron UI sends mouse events to the pin and asserts identical widget rectangles, footer rectangles and portrait pixels before/after unpinning and repinning without dragging in a small host, plus persistence and no dialogue/settings side effects.
- Free-position, compact-mode and drag tests were updated to assert scaled dimensions and the corresponding edges.
- The active installation received the updated geometry and main files after backup and SHA-256 comparison. A live screenshot confirmed the lower-right placement.

Physical cross-DPI moves and model-menu interaction remain unverified. Placement does not inspect or avoid arbitrary expanded composer/menu bounds.

Follow-up: right-side rendering previously switched from right-aligned to centered when unpinned, shifting the footer about 14 DIP left in the native fixture. Alignment now depends on the mirrored side, not the pin state; the position and pixel regressions pass.
