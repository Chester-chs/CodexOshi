. (Join-Path $PSScriptRoot '../scripts/common.ps1')
$output=Join-Path $DataRoot 'stage-5a-popup'
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=Join-Path $DataRoot 'desktop-runtime/node_modules/electron/dist/electron.exe'
$start.Arguments='"'+(Join-Path $SourceRoot 'tests/popup-ui-smoke.cjs')+'" --output "'+$output+'"'
$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardError=$true;$start.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
$fixture=New-Object Diagnostics.Process;$fixture.StartInfo=$start
try{$fixture.Start() | Out-Null;if(-not $fixture.WaitForExit(30000)){$fixture.Kill();throw 'Popup fixture timed out'};if($fixture.ExitCode){throw $fixture.StandardError.ReadToEnd()};Get-Content -LiteralPath (Join-Path $output 'popup-ui.json') -Raw -Encoding UTF8}finally{$fixture.Dispose()}
