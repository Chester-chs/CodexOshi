$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../scripts/common.ps1')
Add-Type -Path @((Join-Path $SourceRoot 'desktop/WindowApi.cs'),(Join-Path $PSScriptRoot 'MouseProbe.cs'))
function State { Get-Content -LiteralPath (Join-Path $DataRoot 'window-state.json') -Raw | ConvertFrom-Json }
function Click-Point($s,$x,$y){
  if(-not [QuotaMouseProbe]::ActivateHost([long]$s.host.window)){throw 'Cannot activate Codex.'}
  [QuotaMouseProbe]::Move($x,$y);Start-Sleep -Milliseconds 160
  $cursor=[QuotaMouseProbe]::Cursor();if($cursor.x -ne $x -or $cursor.y -ne $y){throw 'Cursor moved; no input sent.'}
  [QuotaMouseProbe]::ClickAndSample()
}
$before=State
$wasMaximized=[QuotaMouseProbe]::IsMaximized([long]$before.host.window)
$hostProcess=Get-Process -Id $before.host.hostPid
if($hostProcess.Path -notmatch '\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\(ChatGPT|Codex)\.exe$'){throw 'Unexpected host process.'}
if((Get-Process -Id $before.pid).Path -ne (Join-Path $DataRoot 'desktop-runtime/node_modules/electron/dist/electron.exe').Replace('/','\')){throw 'Unexpected widget process.'}
$bounds=[QuotaWindows]::Audit([long]$before.hwnd).bounds;$scale=$before.host.dpi/96.0;$r=$before.region[0]
$gearX=[int][Math]::Round($bounds.x+($r.x+$r.width-28)*$scale);$gearY=[int][Math]::Round($bounds.y+($r.y+$r.height-28)*$scale)
$gearObservation=Click-Point $before $gearX $gearY;Start-Sleep -Milliseconds 250;$opened=State
if(-not $opened.expanded -or $opened.speechVisible){throw 'Gear did not open settings.'}
if($gearObservation.samples[1].hwnd -ne [long]$before.host.window){throw 'Gear focus did not recover within 300ms.'}
$point=$null
foreach($fx in @(0.15,0.35,0.55)){foreach($fy in @(0.15,0.35,0.55)){
  $x=[int]($bounds.x+$bounds.width*$fx);$y=[int]($bounds.y+$bounds.height*$fy);$dx=($x-$bounds.x)/$scale;$dy=($y-$bounds.y)/$scale
  if(@($opened.region|Where-Object {$dx -ge $_.x -and $dx -lt $_.x+$_.width -and $dy -ge $_.y -and $dy -lt $_.y+$_.height}).Count -eq 0 -and [QuotaMouseProbe]::Hit($x,$y) -eq [long]$before.host.window){$point=@{x=$x;y=$y};break}
};if($point){break}}
if(-not $point){throw 'No host blank point outside the shape.'}
$outsideObservation=Click-Point $opened $point.x $point.y;Start-Sleep -Milliseconds 250;$closed=State
if($closed.expanded -or $closed.speechVisible){throw 'Outside click failed to dismiss.'}
$expected=$closed.widget;$positionBefore=[IO.File]::ReadAllText((Join-Path $DataRoot 'position.json'));$savedBefore=$positionBefore|ConvertFrom-Json;$cycles=@()
try{for($n=0;$n -lt 3;$n++){
  [QuotaMouseProbe]::SetMinimized([long]$before.host.window,$true);Start-Sleep -Milliseconds 750;$hidden=State
  [QuotaMouseProbe]::Restore([long]$before.host.window,$wasMaximized);Start-Sleep -Milliseconds 750;$restored=State
  $saved=Get-Content -LiteralPath (Join-Path $DataRoot 'position.json') -Raw | ConvertFrom-Json
  if($hidden.visible -or -not $restored.visible -or $restored.widget.x -ne $expected.x -or $restored.widget.y -ne $expected.y -or $saved.x -ne $savedBefore.x -or $saved.y -ne $savedBefore.y){throw 'Minimize/restore lost position.'}
  $cycles+=@{hiddenBounds=$hidden.host.bounds;hiddenWidget=$hidden.widget;restoredWidget=$restored.widget;visible=$restored.visible}
}}finally{[QuotaMouseProbe]::Restore([long]$before.host.window,$wasMaximized)}
$result=@{passed=$true;gearObservation=$gearObservation;outsideObservation=$outsideObservation;outsideHostHit=[QuotaMouseProbe]::Hit($point.x,$point.y);minimizeCycles=$cycles;positionUnchanged=([IO.File]::ReadAllText((Join-Path $DataRoot 'position.json')) -eq $positionBefore);resetCredits=$closed.quota.resetCredits}
[IO.File]::WriteAllText((Join-Path $DataRoot 'dialogue-native-probe.json'),($result|ConvertTo-Json -Depth 8),$Utf8)
$result|ConvertTo-Json -Depth 8
