param([switch]$Restart)
. (Join-Path $PSScriptRoot '../scripts/common.ps1')
$output=Join-Path $DataRoot 'resident-dock-ui'
[IO.Directory]::CreateDirectory($output)|Out-Null
$result=Join-Path $output $(if($Restart){'restart.json'}else{'resident-ui.json'})
if(Test-Path -LiteralPath $result){Remove-Item -LiteralPath $result}
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=Join-Path $DataRoot 'desktop-runtime/node_modules/electron/dist/electron.exe'
$start.Arguments='"'+(Join-Path $SourceRoot 'tests/resident-ui-smoke.cjs')+'" --output "'+$output+'"'+$(if($Restart){' --restart'}else{''})
$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardError=$true;$start.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
$fixture=New-Object Diagnostics.Process;$fixture.StartInfo=$start
try{$fixture.Start()|Out-Null;if(-not $fixture.WaitForExit(30000)){$fixture.Kill();throw 'Resident fixture timed out'};if($fixture.ExitCode){throw $fixture.StandardError.ReadToEnd()};if(-not(Test-Path -LiteralPath $result)){throw 'No fresh resident evidence'};Get-Content -LiteralPath $result -Raw -Encoding UTF8}finally{$fixture.Dispose()}
