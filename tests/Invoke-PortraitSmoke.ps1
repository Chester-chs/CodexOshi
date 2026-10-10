param([switch]$Before)
. (Join-Path $PSScriptRoot '../scripts/common.ps1')
$output=Join-Path $DataRoot 'stage-4a-ui'
[IO.Directory]::CreateDirectory($output) | Out-Null
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=Join-Path $DataRoot 'desktop-runtime/node_modules/electron/dist/electron.exe'
$start.Arguments='"'+(Join-Path $SourceRoot 'tests/portrait-ui-smoke.cjs')+'" --output "'+$output+'"'+$(if($Before){' --before'}else{''})
$start.UseShellExecute=$false; $start.CreateNoWindow=$true; $start.RedirectStandardError=$true
$start.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
$fixture=New-Object Diagnostics.Process; $fixture.StartInfo=$start
try {
  $fixture.Start() | Out-Null
  if (-not $fixture.WaitForExit(30000)) { $fixture.Kill(); throw 'Portrait fixture timed out.' }
  $diagnostics=$fixture.StandardError.ReadToEnd();if($fixture.ExitCode){throw $diagnostics}
  Get-Content -LiteralPath (Join-Path $output $(if($Before){'before.json'}else{'portrait-ui-smoke.json'})) -Raw -Encoding UTF8
} finally { $fixture.Dispose() }
