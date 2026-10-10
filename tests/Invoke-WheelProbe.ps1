param([Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]+$')][string]$Label,[switch]$RequirePass)
. (Join-Path $PSScriptRoot '../scripts/common.ps1')
Add-Type -Path @((Join-Path $SourceRoot 'desktop/WindowApi.cs'),(Join-Path $PSScriptRoot 'MouseProbe.cs'))
$statePath=Join-Path $DataRoot 'window-state.json'
function Read-State {
  $s=Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  if([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-$s.updatedAt -gt 3500 -or -not $s.host.attached -or -not $s.visible){throw 'Widget is not attached and ready.'}
  if((Get-Process -Id $s.pid).Path -ne (Join-Path $DataRoot 'desktop-runtime/node_modules/electron/dist/electron.exe')){throw 'Unexpected widget process.'}
  if((Get-Process -Id $s.host.hostPid).Path -notmatch '\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\(ChatGPT|Codex)\.exe$'){throw 'Unexpected host process.'}
  if([QuotaWindows]::Audit([long]$s.hwnd).owner -ne $s.host.window){throw 'Unexpected widget owner.'};return $s
}
function Point($s,$x,$y){
  $b=[QuotaWindows]::Audit([long]$s.hwnd).bounds;$scale=$s.host.dpi/96.0
  return @{x=[int][Math]::Round($b.x+$x*$scale);y=[int][Math]::Round($b.y+$y*$scale)}
}
function Prepare($s,$p){
  if(-not [QuotaMouseProbe]::ActivateHost([long]$s.host.window)){throw 'Cannot foreground Codex.'}
  [QuotaMouseProbe]::Move($p.x,$p.y);Start-Sleep -Milliseconds 150
  $c=[QuotaMouseProbe]::Cursor()
  $hit=[QuotaMouseProbe]::Hit($p.x,$p.y)
  if($c.x -ne $p.x -or $c.y -ne $p.y -or $hit -ne [long]$s.hwnd){throw ('Mouse moved or target not in widget; no input sent. '+(@{point=$p;cursor=$c;hit=$hit;overlay=$s.hwnd} | ConvertTo-Json -Compress))}
}
$s=Read-State
if(-not $s.expanded){$r=$s.region[0];$p=Point $s ($r.x+$r.width/2) ($r.y+$r.height/2);Prepare $s $p;[QuotaMouseProbe]::ClickAndSample() | Out-Null;Start-Sleep -Milliseconds 200;$s=Read-State}
if($s.panelScroll.tab -ne 'character'){
  if($s.panelScroll.top -ne 0){throw 'Header is scrolled out of view; select character tab first.'}
  $p=Point $s $s.panelScroll.roleTab.x $s.panelScroll.roleTab.y;Prepare $s $p;[QuotaMouseProbe]::ClickAndSample() | Out-Null;Start-Sleep -Milliseconds 200;$s=Read-State
}
if($s.panelScroll.tab -ne 'character' -or $s.panelScroll.height -le $s.panelScroll.clientHeight){throw 'Character panel is not scrollable.'}
# Use the panel padding: its center can now land on a range/control that consumes wheel input.
$r=$s.region[1];$p=Point $s ($r.x+4) ($r.y+$r.height/2);Prepare $s $p
$before=Read-State;$foregroundBefore=[QuotaMouseProbe]::Foreground()
$delta=if($before.panelScroll.top -eq 0){-120}else{120}
$sent=[QuotaMouseProbe]::Wheel($delta);Start-Sleep -Milliseconds 500;$after=Read-State
$foregroundAfter=[QuotaMouseProbe]::Foreground()
$scrollPass=$after.panelScroll.top -ne $before.panelScroll.top -and $after.panelScroll.wheelEvents -gt $before.panelScroll.wheelEvents
$focusPass=$foregroundBefore -eq [long]$s.host.window -and $foregroundAfter -eq $foregroundBefore -and -not $after.focused
$outsidePoint=$null
foreach($fx in @(0.1,0.5,0.9)) { foreach($fy in @(0.1,0.5,0.9)) {
  $q=Point $s ($s.viewport.width*$fx) ($s.viewport.height*$fy)
  if([QuotaMouseProbe]::Hit($q.x,$q.y) -eq [long]$s.host.window){$outsidePoint=$q;break}
};if($outsidePoint){break} }
if(-not $outsidePoint){throw 'No shape-external host point available.'}
[QuotaMouseProbe]::Move($outsidePoint.x,$outsidePoint.y);Start-Sleep -Milliseconds 150
$c=[QuotaMouseProbe]::Cursor()
if($c.x -ne $outsidePoint.x -or $c.y -ne $outsidePoint.y -or [QuotaMouseProbe]::Hit($c.x,$c.y) -ne [long]$s.host.window){throw 'Cursor moved before outside wheel; no input sent.'}
$outsideBefore=Read-State;[QuotaMouseProbe]::Wheel(-120) | Out-Null;Start-Sleep -Milliseconds 500;$outsideAfter=Read-State
$outsidePass=$outsideBefore.host.nativeInput.wheels -eq $outsideAfter.host.nativeInput.wheels -and $outsideBefore.panelScroll.top -eq $outsideAfter.panelScroll.top -and $outsideBefore.panelScroll.wheelEvents -eq $outsideAfter.panelScroll.wheelEvents -and [QuotaMouseProbe]::Foreground() -eq [long]$s.host.window
$evidence=[ordered]@{label=$Label;host=$s.host.window;overlay=$s.hwnd;point=$p;delta=$delta;sent=$sent;before=$before.panelScroll;after=$after.panelScroll;foregroundBefore=$foregroundBefore;foregroundAfter=$foregroundAfter;scrollPass=$scrollPass;focusPass=$focusPass;passed=($scrollPass -and $focusPass)}
$evidence.outside=@{point=$outsidePoint;forwardedBefore=$outsideBefore.host.nativeInput.wheels;forwardedAfter=$outsideAfter.host.nativeInput.wheels;passed=$outsidePass};$evidence.passed=$evidence.passed -and $outsidePass
$json=$evidence | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $DataRoot ('wheel-probe-'+$Label+'.json')),$json,$Utf8);Write-Output $json
if($RequirePass -and -not $evidence.passed){throw 'Character wheel/focus regression failed.'}
