# Codi 0.2.4 — sound presets, portrait footer, and dialogue clicks

## Behavior

- Five locally synthesized sounds: Wooden note, Bubble pop, Clear bell, Starlight duo, and Soft tap. Each has an independent preview. Selecting saves; previewing does not change the saved selection. Selection does not play audio automatically.
- Uploaded audio is retained when choosing a preset and can be selected again. Removing it preserves the last selected preset. Legacy custom-sound settings remain compatible. Volume and mute apply to previews and portrait clicks.
- The quota footer follows the portrait's actual rendered width and horizontal position. It stays below the artwork, and tiny portraits retain a bounded 118 logical pixel minimum so the percentage and gear remain usable. Saved target dimensions and the outer docking geometry are unchanged.
- Clicking the portrait always displays the first dialogue. Clicking the visible bubble cycles the two lines without playing the portrait sound. Dismissal returns to the first line on the next portrait click; the second line hides reset details.

## Verification

- `npm test`: 212 passed, 0 failed. New persistence, preview, portrait-width, and dialogue regressions were observed failing before their fixes.
- `tests/Invoke-ClickSoundSmoke.ps1`: default, custom, presets, and all three restart modes passed in hidden Electron windows with hardware output muted. Five distinct audio buffers were observed; persisted preset/custom/volume, no autoplay on selection, preview isolation, mute, zero volume, translations, selection styling, and mouse dialogue routing were checked.
- `tests/Invoke-PortraitFooterSmoke.ps1`: production rendering originally produced an approximately 392 px footer under 152 px artwork. The corrected footer follows the artwork across 126–672 px target widths, 180–420 px heights, 0.5–4× framing, panning, reduced/restored host dimensions, and placeholder artwork. The fixture ran with a 150% display scale.
- `tests/Invoke-ResidentSmoke.ps1`: passed after correcting the fixture's race between opening settings and choosing Character. It now waits for the settings opening to finish before selecting the tab.
- `tests/Invoke-CardSmoke.ps1` and `-Restart`: passed. The restart fixture now waits for the first real click to open its bubble instead of assuming that renderer and main-process state settle within 150 ms.
- Independent code review found and corrected removal of an inactive uploaded sound incorrectly resetting the chosen preset. No further actionable defects were found in the mouse dialogue and width changes.

Hidden-window input and audio measurements do not establish subjective sound quality, real desktop focus restoration, or physical cross-monitor DPI behavior. Enter/Space handlers are present, but the native overlay returns focus to Codex, so keyboard availability is not claimed from injected-key tests.
