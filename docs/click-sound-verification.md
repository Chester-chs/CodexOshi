# Click sound — Codi 0.2.1

Verified on Windows, 2026-10-11.

- Clicking the portrait plays a quiet, locally synthesized 0.24-second chime alongside either dialogue. Dragging, cancellation, the settings gear and blank space do not play it.
- Character settings includes a saved Click sound checkbox, enabled by default for existing installations. Turning Codi off also disables playback. Audio device errors do not block dialogue.
- Context creation is lazy; repeated input is bounded and interrupted/resumed audio cannot play after muting. No dependency or media download was added.
- `scripts/verify.ps1 -Native`: **179/179 passed**, plus 10 real Electron shape cases.
- `tests/Invoke-ClickSoundSmoke.ps1`, then `-Restart`: passed with actual renderer gestures, preload/IPC, preference files, native AudioContext sources and an OfflineAudioContext render. First/second clicks produced two buffers; mute survived page reload and process restart while dialogue still alternated. No renderer errors or unhandled rejections.
- Test output was muted at the hardware boundary. The image-processing worker uses a deterministic local bitmap fixture so the sound test remains independent of portrait preprocessing. Synthesized signal peak: 0.1043; RMS: 0.0218.
- Preference regressions cover simultaneous sound, docking, power, language and size changes, plus recovery after failed saves.
