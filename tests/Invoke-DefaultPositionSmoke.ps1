. (Join-Path $PSScriptRoot '../scripts/common.ps1')
$output=Join-Path $DataRoot 'default-position-native'
foreach($scenario in @('fresh','saved','restart-saved','reset','restart-reset','small','corrupt')) {
  $start=New-Object Diagnostics.ProcessStartInfo
  $start.FileName=Join-Path $DataRoot 'desktop-runtime/node_modules/electron/dist/electron.exe'
  $start.Arguments='"'+(Join-Path $SourceRoot 'tests/default-position-smoke.cjs')+'" --output "'+$output+'" --case '+$scenario
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardError=$true;$start.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
  $fixture=New-Object Diagnostics.Process;$fixture.StartInfo=$start
  try {
    $fixture.Start() | Out-Null
    if(-not $fixture.WaitForExit(15000)){$fixture.Kill();throw 'Default position fixture timed out.'}
    if($fixture.ExitCode){throw $fixture.StandardError.ReadToEnd()}
    Get-Content -LiteralPath (Join-Path $output ($scenario+'.json')) -Raw -Encoding UTF8
  } finally {$fixture.Dispose()}
}
