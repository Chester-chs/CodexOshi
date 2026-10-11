# Codi 0.2.6 — default sound and dimension controls

## Behavior

- Starlight duo is the sole built-in/default click sound. Its waveform is unchanged. The preset list and the other four generators are removed. Uploaded audio, preview, mute, and volume controls remain. Switching to the default retains the upload; removing the upload restores Starlight duo. Older built-in selections load the default, while selected custom audio stays selected.
- Window-dependent shrinking uses the host viewport dimensions independently of the selected portrait dimensions. Increasing width or size no longer shrinks the other axis. Artwork preserves its aspect ratio, so a dimension can plateau when the other dimension is the limiting constraint. Settings stay under the pointer while dimensions change.
- Restore defaults resets size to 280, removes the explicit width override, and restores 1× framing with zero pan. It preserves the selected artwork and background-removal choice. Repeated resets and edits queued around a reset preserve the latest requested values.
- The checkbox reads “固定，随窗口一起缩放” / “Pin and scale with window”. When pinned, the visible character and its footer reach the Codex window's right edge, including upper-body crops. Per-row alpha bounds remove only empty horizontal columns from the selected crop; the pixel scale stays uniform. Settings cards and free placement keep their existing outer margin, and unpinning restores the saved manual position.

## Verification

- `npm test`: 213 passed, 0 failed. Sound migration/default, width inversion, reset, and visible-alpha regressions were observed failing before their fixes.
- `tests/Invoke-ClickSoundSmoke.ps1`: normal, custom, and built-in modes, plus all three restart modes, passed in hidden Electron windows with hardware output muted. Checks cover the sole default waveform, old preset migration, removed preset UI/API, upload/default switching and retention, preview isolation, mute, volume, Chinese/English labels, reload, restart, and dialogue routing.
- `tests/Invoke-PortraitFooterSmoke.ps1`: passed with five width values in two viewport sizes, numeric size edits, a real range End key, a real reset-button mouse click after numeric-field focus, repeated reset, and rapid pending saves. It measures nontransparent canvas pixels as well as draw geometry and verifies the right edge, matching footer, fixed settings position, cropped and full portraits, placeholder, and window shrink/restore.
- `tests/Invoke-ResidentSmoke.ps1` and `-Restart`: passed. Numeric controls, rejected invalid values, saved free position, pinned resize/restore, the visible Codi switch, and restart persistence were checked.

These hidden-window checks do not establish subjective sound quality, physical desktop focus timing, or real cross-monitor DPI behavior.
