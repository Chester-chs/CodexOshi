param([Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]+$')][string]$Label,[switch]$RequirePass,[switch]$VerifySwitchAway)
$ErrorActionPreference='Stop'
$source=Split-Path -Parent $PSScriptRoot
$codexRoot=if($env:CODEX_HOME){$env:CODEX_HOME}else{Join-Path $env:USERPROFILE '.codex'}
$data=Join-Path $codexRoot 'codex-quota-widget'
$statePath=Join-Path $data 'window-state.json'
$positionPath=Join-Path $data 'position.json'
Add-Type -Path @((Join-Path $source 'desktop\WindowApi.cs'),(Join-Path $PSScriptRoot 'MouseProbe.cs'))
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
    $hit=[QuotaMouseProbe]::Hit($point.x,$point.y)
    if($hit -ne [long]$state.hwnd){throw ('Center is not hitting the widget; no input sent. '+(@{point=$point;hit=$hit;audit=[QuotaWindows]::Audit([long]$state.hwnd)} | ConvertTo-Json -Depth 5 -Compress))}
}
function Outside-Hits($state) {
    $bounds=[QuotaWindows]::Audit([long]$state.hwnd).bounds
    $scale=$state.host.dpi/96.0
    foreach($fx in @(0.1,0.25,0.5,0.75,0.9)) {
        foreach($fy in @(0.1,0.25,0.5,0.75,0.9)) {
            $x=[int]($bounds.x+$bounds.width*$fx);$y=[int]($bounds.y+$bounds.height*$fy)
            $dipX=($x-$bounds.x)/$scale;$dipY=($y-$bounds.y)/$scale
            $inside=@($state.region | Where-Object {$dipX -ge $_.x -and $dipX -lt $_.x+$_.width -and $dipY -ge $_.y -and $dipY -lt $_.y+$_.height}).Count -gt 0
            if(-not $inside){[pscustomobject]@{x=$x;y=$y;root=[QuotaMouseProbe]::Hit($x,$y)}}
        }
    }
}
$deadline=[DateTime]::UtcNow.AddSeconds(5)
while($true) {
    try {$before=Read-State;break}
    catch {if([DateTime]::UtcNow -ge $deadline){throw};Start-Sleep -Milliseconds 100}
}
$positionBefore=Get-Content -LiteralPath $positionPath -Raw | ConvertFrom-Json
$point=Center $before
Prepare $before $point
$clickForegroundBefore=[QuotaMouseProbe]::Foreground()
$clickObservation=[QuotaMouseProbe]::ClickAndSample()
Start-Sleep -Milliseconds 500
$clicked=Read-State
$clickForegroundAfter=[QuotaMouseProbe]::Foreground()
$outside=@(Outside-Hits $clicked)
$point=Center $clicked
Prepare $clicked $point
$dragForegroundBefore=[QuotaMouseProbe]::Foreground()
$scale=$clicked.host.dpi/96.0
$dx=if($clicked.widget.x -gt $clicked.viewport.width/2){-40}else{40}
$dy=if($clicked.widget.y -gt $clicked.viewport.height/2){-24}else{24}
$dragObservation=[QuotaMouseProbe]::DragAndSample($point.x,$point.y,[int]($dx*$scale),[int]($dy*$scale))
Start-Sleep -Milliseconds 500
$dragged=Read-State
$positionAfter=Get-Content -LiteralPath $positionPath -Raw | ConvertFrom-Json
$activationResult=[QuotaMouseProbe]::MouseActivateResult([long]$dragged.hwnd,[long]$dragged.host.window)
$clickPass=$clicked.clicks -eq $before.clicks+1
$dragPass=($dragged.widget.x -ne $clicked.widget.x -or $dragged.widget.y -ne $clicked.widget.y) -and ($positionAfter.x -eq $dragged.widget.x -and $positionAfter.y -eq $dragged.widget.y) -and ($positionBefore.x -ne $positionAfter.x -or $positionBefore.y -ne $positionAfter.y)
$earlyHost=($clickObservation.transitions | Where-Object {$_.elapsedMs -le 300} | Select-Object -Last 1).hwnd -eq $clickForegroundBefore
$focusPass=$clickForegroundBefore -eq [long]$before.host.window -and $earlyHost -and $clickObservation.samples[1].hwnd -eq $clickForegroundBefore -and $clickObservation.samples[2].hwnd -eq $clickForegroundBefore -and $clickForegroundAfter -eq $clickForegroundBefore -and $dragForegroundBefore -eq [long]$before.host.window -and $dragObservation.samples[1].hwnd -eq $dragForegroundBefore -and $dragObservation.samples[2].hwnd -eq $dragForegroundBefore -and [QuotaMouseProbe]::Foreground() -eq $dragForegroundBefore
$outsidePass=$outside.Count -gt 0 -and @($outside | Where-Object {$_.root -ne [long]$before.host.window}).Count -eq 0
$evidence=[ordered]@{label=$Label;host=$before.host.window;overlay=$before.hwnd;clicksBefore=$before.clicks;clicksAfter=$clicked.clicks;clickForegroundBefore=$clickForegroundBefore;clickObservation=$clickObservation;clickForegroundAfter=$clickForegroundAfter;dragForegroundBefore=$dragForegroundBefore;dragObservation=$dragObservation;dragForegroundAfter=[QuotaMouseProbe]::Foreground();widgetBefore=$clicked.widget;widgetAfter=$dragged.widget;positionBefore=$positionBefore;positionAfter=$positionAfter;mouseActivateResult=$activationResult;outsideHits=$outside;clickPass=$clickPass;dragPass=$dragPass;focusPass=$focusPass;outsidePass=$outsidePass;passed=($clickPass -and $dragPass -and $focusPass -and $outsidePass)}
if($VerifySwitchAway) {
    # A test-owned window substitutes for another app; no third-party UI is driven.
    Add-Type -AssemblyName System.Windows.Forms
    $fixture=New-Object Windows.Forms.Form
    $fixture.Text='Quota focus regression fixture';$fixture.ShowInTaskbar=$false
    $fixture.StartPosition='Manual';$fixture.Width=160;$fixture.Height=80
    $fixture.Left=20;$fixture.Top=20
    try {
        $fixture.Show();$fixtureHandle=$fixture.Handle.ToInt64()
        $switchBefore=Read-State;Prepare $switchBefore (Center $switchBefore)
        $switchObservation=[QuotaMouseProbe]::ClickThenSwitchAndSample($fixtureHandle)
        Start-Sleep -Milliseconds 500
        $switchAfter=Read-State
        $switchPass=@($switchObservation.samples | Where-Object {$_.hwnd -ne $fixtureHandle}).Count -eq 0 -and [QuotaMouseProbe]::Foreground() -eq $fixtureHandle -and $switchAfter.clicks -eq $switchBefore.clicks+1
        $evidence.switchAway=@{fixture=$fixtureHandle;observation=$switchObservation;clicksBefore=$switchBefore.clicks;clicksAfter=$switchAfter.clicks;passed=$switchPass}
        $evidence.passed=$evidence.passed -and $switchPass
    } finally {$fixture.Close();$fixture.Dispose();[QuotaMouseProbe]::ActivateHost([long]$before.host.window) | Out-Null}
}
$json=$evidence | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $data ('mouse-probe-'+$Label+'.json')),$json,(New-Object Text.UTF8Encoding($false)))
Write-Output $json
if($RequirePass -and -not $evidence.passed){throw 'Mouse input and host focus regression acceptance failed.'}
