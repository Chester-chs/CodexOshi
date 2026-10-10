. (Join-Path $PSScriptRoot '../scripts/common.ps1')
$output=Join-Path $DataRoot 'stage-4b-ui'
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=Join-Path $DataRoot 'desktop-runtime/node_modules/electron/dist/electron.exe'
$start.Arguments='"'+(Join-Path $SourceRoot 'tests/single-character-ui-smoke.cjs')+'" --output "'+$output+'"'
$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardError=$true;$start.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
$fixture=New-Object Diagnostics.Process;$fixture.StartInfo=$start
try {$fixture.Start() | Out-Null;if(-not $fixture.WaitForExit(20000)){$fixture.Kill();throw 'Single character fixture timed out'};if($fixture.ExitCode){throw $fixture.StandardError.ReadToEnd()};Get-Content -LiteralPath (Join-Path $output 'single-character-ui.json') -Raw -Encoding UTF8}finally{$fixture.Dispose()}
