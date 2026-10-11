. (Join-Path $PSScriptRoot '../scripts/common.ps1')
$output=Join-Path $DataRoot 'portrait-footer-ui'
[IO.Directory]::CreateDirectory($output)|Out-Null
$result=Join-Path $output 'portrait-footer-ui.json'
if(Test-Path -LiteralPath $result){Remove-Item -LiteralPath $result}
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=Join-Path $DataRoot 'desktop-runtime/node_modules/electron/dist/electron.exe'
$start.Arguments='"'+(Join-Path $SourceRoot 'tests/portrait-footer-ui-smoke.cjs')+'" --output "'+$output+'"'
$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.WindowStyle='Hidden';$start.RedirectStandardError=$true;$start.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
$fixture=New-Object Diagnostics.Process;$fixture.StartInfo=$start
try{$fixture.Start()|Out-Null;if(-not $fixture.WaitForExit(30000)){$fixture.Kill();throw 'Portrait footer fixture timed out'};if($fixture.ExitCode){throw $fixture.StandardError.ReadToEnd()};if(-not(Test-Path -LiteralPath $result)){throw 'No fresh portrait footer evidence'};Get-Content -LiteralPath $result -Raw -Encoding UTF8}finally{$fixture.Dispose()}
