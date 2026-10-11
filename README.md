# Codi

<p align="center">
  <a href="README.md">English</a> | <a href="README.zh-CN.md">中文</a>
</p>

Your Codex desktop companion: a character widget with quota monitoring, local token usage charts, and customizable dialogue.

> Codi currently supports **Windows x64 and the Codex desktop app**. It reads quota and local usage data without generating model responses. Your character images stay on your computer.

**Character tip:** use a chibi-style character with a transparent background and the full body inside the image. Its compact proportions are easier to see in a small widget. Regular character artwork works too.

## Features

- **Quota at a glance:** remaining percentage, progress bar, reset countdown, and available reset credits when returned by account data. Codi displays reset credits; it does not spend them.
- **Time-based token charts:** 24 hourly bars, 7 daily bars, or 30 daily bars, with the selected total and exact values. The current hour/day is still in progress.
- **One image per character:** upload directly, switch characters, remove simple backgrounds, and adjust framing in a local preview. Legacy multi-image characters continue to work.
- **Two click dialogues:** clicking the character always shows the first dialogue with reset information. Click the bubble to cycle between the two lines. Closing the bubble starts the sequence over. Edit both lines in the settings page or choose a preset.
- **Click sound:** choose Wooden note, Bubble pop, Clear bell, Starlight duo, or Soft tap under **Codi Settings → Character → Click sound**. Each has a preview button; previewing keeps your current choice, while selecting saves automatically. Upload your own sound and switch back to it at any time. Volume is adjustable from 0–100%. WAV, MP3, OGG, M4A and FLAC clips up to 30 seconds / 10 MiB are supported; files and choices stay on this computer.
- **Character controls:** size and width sit together, each with a slider and numeric input. Framing uses a 0.5–4× multiplier with −/+ adjustment. The progress bar stays below the character.
- **Window following:** pinned bottom-right by default, with proportional shrinking in smaller Codex windows. Turn off pinning to drag the character and save its position.
- **One settings card:** use the gear beside the progress bar to open quota, token usage, character, and appearance settings. Resize the card; clicking outside closes it. Every new opening starts on Quota.
- **Appearance and language:** seven paired themes, custom background/accent colors, and Simplified Chinese or English. Settings are saved locally.
- **One-click updates:** Codi checks for new versions every 6 hours. When an update is available, click **Update now** in Codi Settings to download, install, and restart Codi while keeping your characters and settings.
- **Tibo reset announcements:** checks @thsottiaux’s free public timeline every 30 minutes, converts explicit reset times to the system timezone, and notifies once per recent announcement.
- **Visible on/off control:** switch off from the settings card; a small Codi switch remains inside the Codex window so you can turn it back on.

## Preview

Screenshots use geometric placeholder artwork and synthetic usage data, not user character images.

![Character size, width, and framing controls](docs/images/resident-framing-width.png)

![30-day token chart](docs/images/ui-redesign-token-30-days.png)

## Requirements

- Windows x64, Windows PowerShell 5.1, and the built-in .NET Framework C# compiler.
- Codex desktop installed and signed in, with its CLI available to the installer.
- Node.js 24+: installs Electron and runs the local plugin status service. This is the currently supported and tested version range; earlier versions have not been verified.
- Git: downloads and updates the source in the instructions below. The running widget does not need Git.
- Network access for installation downloads and account quota reads. No separate API key is required.

MSVC, C++ native modules, and an additional C# SDK are not required. macOS and Linux are not supported by this implementation.

You can skip Git by downloading the source with GitHub’s **Code → Download ZIP** and extracting it to the installation folder below. Codi currently uses source installation; a standalone installer is not available yet.

## Installation

### Option 1: ask Codex to install it

Open a local chat in the Codex desktop app and paste this prompt:

```text
Please install Codi on this Windows computer: https://github.com/Chester-chs/Codi.
Check that Codex, Git, and Node.js 24+ are available, and help install missing dependencies.
Place the project in %USERPROFILE%\plugins\codex-quota-widget. If it already exists, check it first and preserve my local changes, characters, and settings.
From the project folder, run: powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1.
Verify that Codi appears in Codex and explain how to use its visible switch. If Codex needs restarting, ask me to restart it myself.
```

### Option 2: install it yourself

1. Install and sign in to Codex desktop. Install **Node.js 24+** and **Git** if needed.
2. Open the Windows Start menu, search for **PowerShell**, and open it. Copy and run these lines:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\plugins" | Out-Null
git clone https://github.com/Chester-chs/Codi.git "$env:USERPROFILE\plugins\codex-quota-widget"
Set-Location "$env:USERPROFILE\plugins\codex-quota-widget"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\install.ps1
```

3. Wait for installation to finish. Fully quit and reopen Codex, then open a new chat. Codi should appear at the bottom-right.

Use the folder shown above: the installer checks its location. If you already have Codi 0.2.0 or later, update from Codi Settings. For older versions, use Option 1 once instead of cloning again. While the repository is private, your GitHub account needs access to download it.

Installation also enables Windows login startup by default. To skip that, add `-NoStartup` to the installation command; add `-NoStart` to skip starting immediately. After a later MCP service update, restart Codex and open a new chat again.

## Updates and reset announcements

Open **Codi Settings → Quota** and scroll to **Updates & announcements**. Use **Check for updates**, **Check announcements**, or the **Check automatically** toggle. Automatic checks run while Codi is enabled and the Codex window is visible. Silent system notifications appear when supported, and a dot beside the gear indicates new information.

![One-click update in Codi Settings (synthetic version numbers)](docs/images/one-click-update.png)

- **Versions:** click **Check for updates → Update now** when a new version is found. Codi downloads a fixed revision, prepares it before stopping, and restarts automatically. Failed preparation leaves the current version running; failed installation attempts to restore the previous version. Your characters, dialogue, colors, and position are preserved. A private repository requires GitHub CLI signed in with access via `gh auth login`; public repositories need no login. Codex itself is not restarted. An updated MCP service takes effect when you next restart Codex.
- **Update storage:** application releases and a recovery backup stay in the local Codi data folder. Your source checkout is preserved. Maintainers must increase the application version in `package.json` and `package-lock.json` when publishing a new version; the plugin registration version remains separate.
- **Announcements:** reads [Tibo @thsottiaux](https://x.com/thsottiaux) through the free public timeline, with no X API key. This endpoint can be rate limited or unavailable. Failures retain the previous result; rate limits delay retries by at least 30 minutes. Manual checks have a one-minute cooldown.
- **Times:** recognizes common explicit dates, today/tomorrow/weekdays, UTC or US Eastern/Pacific zones, and relative hours/minutes. Vague, conditional or unconfirmed times are shown with the original text rather than guessed. Announcements do not replace account quota data or mark quota as restored when the announced time passes.
- **Notifications:** only recent new announcements trigger notifications; deduplication survives restarts. Post content is displayed as text. Displayed times update when the system timezone changes.

## On / off inside Codex

1. Click the gear beside the progress bar to open settings.
2. Click the **Codi switch at the top** to turn the character widget off. The character, bar, dialogue, and settings card disappear; new quota reads and token indexing pause. A quota request already in flight may finish.
3. A small **Codi switch** remains at the bottom-right of the Codex window. Click it to turn the widget back on and restore its dimensions and position.

The switch state is saved across restarts. This is Codi's own overlay control inside the Codex window, not an added control in Codex's native settings page. The × button closes the settings card only. The Codex plugin toggle controls the MCP service separately.

![Small switch while the widget is off](docs/images/codi-switch-off.png)

To stop the entire background monitor, including the small switch, or start it again, use PowerShell:

```powershell
# Start the monitor; the saved visible-switch state is preserved
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\plugins\codex-quota-widget\scripts\start.ps1"

# Stop the monitor; keep your characters and settings
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\plugins\codex-quota-widget\scripts\stop.ps1"
```

Stopping persists the monitor's disabled state; starting enables it again. To uninstall, run the following. It removes Codi's login task and plugin entry and retains user data:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\plugins\codex-quota-widget\scripts\uninstall.ps1"
```

## Using Codi

1. Open Codex. Codi follows its client area and hides when the host is unavailable or minimized.
2. Click the character for a dialogue bubble. Click the gear to open settings.
3. In **Character**, click **Upload portrait**. No separate create action is needed. Size and width can be entered directly; invalid values do not replace the last valid setting.
4. Adjust the framing multiplier and drag the processed preview to pan. Zooming changes the visible portion; width is controlled independently. Changing character dimensions keeps the open settings card stable.
5. Edit the two dialogue lines in the same page. `{重置时间}` inserts a duration such as `3d 21h`; write the surrounding sentence yourself. Presets remain editable and take effect after saving.
6. In **Appearance**, select a theme or customize its background and accent. Text and selected controls use adjusted contrast colors for readability.

Quota colors retain their thresholds: normal above 20%, orange above 10% through 20%, and red at 10% or below. The character image does not change with quota.

## Data and privacy

- **No model turns:** quota reads are restricted to the fixed quota HTTP GET endpoint, local `auth.json` and `sessions/**/*.jsonl`, and app-server `initialize` / `account/rateLimits/read`. Codi does not generate completions or start agent turns.
- **Update and announcement requests:** additionally reads the fixed GitHub repository and public X timeline. Clicking Update now downloads the repository archive and, only when dependencies change, the required runtime packages. Codex tokens, conversations, and artwork are never sent to these services. Private-repository access uses the existing GitHub CLI login; Codi does not read or store its token.
- **Local images:** PNG, JPEG, WebP, GIF, and BMP are checked by content, up to 10 MiB and 4096 pixels per side. HEIC is unsupported. Import copies the original; replacement preserves earlier copies. No image upload endpoint is used.
- **Legacy characters:** an explicit single portrait takes priority. Otherwise, the first available image in `ready > tired > low > exhausted` order is used. Reading does not delete old images or rewrite their settings.
- **Token scope:** charts summarize token-count increments in this computer's existing Codex session files. They are not official account-wide totals and exclude deleted sessions and other computers. Indexing or partial-coverage notices identify incomplete data.
- **Quota freshness:** failed reads retain available data with an age/status indication. An elapsed reset deadline does not fabricate a restored quota. Unavailable reset-credit data remains unknown.
- **Storage:** data lives under `<CODEX_HOME>\codex-quota-widget`, or `%USERPROFILE%\.codex\codex-quota-widget` when `CODEX_HOME` is unset. Source, plugin cache, and user data are separate. Authentication tokens are not written to widget diagnostics.

Only upload artwork you have permission to use. Bundled placeholder art is geometric; user character art is not distributed in this repository.

## Verification and technical notes

```powershell
Set-Location "$env:USERPROFILE\plugins\codex-quota-widget"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\verify.ps1 -Native
```

Automated checks cover geometry limits, invalid-shape 1×1 fallback, persistence, migration, and the quota/token read policy. Hidden Electron fixtures exercise rendering and controls. Real desktop input, click-to-host focus timing, and cross-DPI behavior require separate live checks; passing automated tests does not establish those results.

The overlay is shaped around visible regions; outside regions pass input to Codex. Ordinary clicks use delayed host-focus restoration; editing fields temporarily retain focus. Free dragging does not write files in the event handler: position saves on release, with timer checkpoints after a drag exceeds three seconds. The outer scrollbar edge is reserved; individual internal pane scrollbars are not automatically located.

Detailed records: [window docking and dimension controls](docs/resident-docking-width-verification.md), [visible switch](docs/codi-switch-verification.md), [drag performance](docs/drag-performance-verification.md), [UI and token charts](docs/ui-redesign-verification.md), and [character formats](docs/character-formats-verification.md). Older stage records document earlier behavior.

Use the installation and data paths listed above. The `v1.0` tag preserves an earlier rollback snapshot; it is not the plugin manifest version.

## License

[MIT](LICENSE). Third-party notices and bundled font licensing are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
