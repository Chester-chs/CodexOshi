param([Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]+$')][string]$Label,[switch]$RequirePass)
$ErrorActionPreference='Stop'
$source=Split-Path -Parent $PSScriptRoot
$codexRoot=if($env:CODEX_HOME){$env:CODEX_HOME}else{Join-Path $env:USERPROFILE '.codex'}
$data=Join-Path $codexRoot 'codex-quota-widget'
$statePath=Join-Path $data 'window-state.json'
$positionPath=Join-Path $data 'position.json'
Add-Type -Path (Join-Path $source 'desktop\WindowApi.cs')
Add-Type -Path (Join-Path $PSScriptRoot 'MouseProbe.cs')
function Read-State {
    $result=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    if([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-$result.updatedAt -gt 3500 -or -not $result.host.attached -or -not $result.visible){throw 'Widget is not currently ready and attached.'}
    $electron=Get-Process -Id $result.pid
    $expected=Join-Path $data 'desktop-runtime\node_modules\electron\dist\electron.exe'
    if($electron.Path -ne $expected){throw 'Widget PID does not match the installed Electron.'}
    $hostProcess=Get-Process -Id $result.host.hostPid
    if($hostProcess.Path -notmatch '\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\(ChatGPT|Codex)\.exe$'){throw 'Host PID does not match Codex Desktop.'}
    if([QuotaWindows]::Audit([long]$result.hwnd).owner -ne $result.host.window){throw 'Widget owner changed.'}
    return $result
}
function Center($state) {
    $bounds=[QuotaWindows]::Audit([long]$state.hwnd).bounds
    $r=$state.region[0];$scale=$state.host.dpi/96.0
    return @{x=[int][Math]::Round($bounds.x+($r.x+$r.width/2.0)*$scale);y=[int][Math]::Round($bounds.y+($r.y+$r.height/2.0)*$scale)}
}
function Prepare($state,$point) {
    if(-not [QuotaMouseProbe]::ActivateHost([long]$state.host.window)){throw 'Cannot activate host for the controlled probe.'}
    [QuotaMouseProbe]::Move($point.x,$point.y)
    Start-Sleep -Milliseconds 150
    if([QuotaMouseProbe]::Hit($point.x,$point.y) -ne [long]$state.hwnd){throw 'Center is not hitting the widget; no input sent.'}
}
$before=Read-State
$positionBefore=Get-Content -LiteralPath $positionPath -Raw | ConvertFrom-Json
$point=Center $before
Prepare $before $point
$clickForegroundBefore=[QuotaMouseProbe]::Foreground()
$sent=[QuotaMouseProbe]::Click()
$clickForegroundImmediate=[QuotaMouseProbe]::Foreground()
Start-Sleep -Milliseconds 1500
$clicked=Read-State
$clickForegroundAfter=[QuotaMouseProbe]::Foreground()
$point=Center $clicked
Prepare $clicked $point
$dragForegroundBefore=[QuotaMouseProbe]::Foreground()
$scale=$clicked.host.dpi/96.0
$dx=if($clicked.widget.x -gt $clicked.viewport.width/2){-40}else{40}
$dy=if($clicked.widget.y -gt $clicked.viewport.height/2){-24}else{24}
[QuotaMouseProbe]::Drag($point.x,$point.y,[int]($dx*$scale),[int]($dy*$scale))
$dragForegroundImmediate=[QuotaMouseProbe]::Foreground()
Start-Sleep -Milliseconds 1500
$dragged=Read-State
$positionAfter=Get-Content -LiteralPath $positionPath -Raw | ConvertFrom-Json
$activationResult=[QuotaMouseProbe]::MouseActivateResult([long]$dragged.hwnd,[long]$dragged.host.window)
$clickPass=$clicked.clicks -eq $before.clicks+1
$dragPass=($dragged.widget.x -ne $clicked.widget.x -or $dragged.widget.y -ne $clicked.widget.y) -and ($positionAfter.x -eq $dragged.widget.x -and $positionAfter.y -eq $dragged.widget.y) -and ($positionBefore.x -ne $positionAfter.x -or $positionBefore.y -ne $positionAfter.y)
$focusPass=$clickForegroundBefore -eq [long]$before.host.window -and $clickForegroundImmediate -eq $clickForegroundBefore -and $clickForegroundAfter -eq $clickForegroundBefore -and $dragForegroundBefore -eq [long]$before.host.window -and $dragForegroundImmediate -eq $dragForegroundBefore -and [QuotaMouseProbe]::Foreground() -eq $dragForegroundBefore
$evidence=[ordered]@{label=$Label;host=$before.host.window;overlay=$before.hwnd;sendInputReturned=$sent;clicksBefore=$before.clicks;clicksAfter=$clicked.clicks;clickForegroundBefore=$clickForegroundBefore;clickForegroundImmediate=$clickForegroundImmediate;clickForegroundAfter=$clickForegroundAfter;dragForegroundBefore=$dragForegroundBefore;dragForegroundImmediate=$dragForegroundImmediate;dragForegroundAfter=[QuotaMouseProbe]::Foreground();widgetBefore=$clicked.widget;widgetAfter=$dragged.widget;positionBefore=$positionBefore;positionAfter=$positionAfter;mouseActivateResult=$activationResult;clickPass=$clickPass;dragPass=$dragPass;focusPass=$focusPass;passed=($clickPass -and $dragPass -and $focusPass)}
$json=$evidence | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $data ('mouse-probe-'+$Label+'.json')),$json,(New-Object Text.UTF8Encoding($false)))
Write-Output $json
if($RequirePass -and -not $evidence.passed){throw 'Mouse input and host focus regression acceptance failed.'}
