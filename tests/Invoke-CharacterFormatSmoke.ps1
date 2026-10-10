. (Join-Path $PSScriptRoot '../scripts/common.ps1')
$output=Join-Path $DataRoot 'character-format-smoke'
[IO.Directory]::CreateDirectory($output) | Out-Null
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=Join-Path $DataRoot 'desktop-runtime/node_modules/electron/dist/electron.exe'
$start.Arguments='"'+(Join-Path $SourceRoot 'tests/character-format-smoke.cjs')+'" --output "'+$output+'"'
$start.UseShellExecute=$false; $start.CreateNoWindow=$true; $start.RedirectStandardError=$true
$start.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
$fixture=New-Object Diagnostics.Process; $fixture.StartInfo=$start
try {
  $fixture.Start() | Out-Null
  if (-not $fixture.WaitForExit(30000)) { $fixture.Kill(); throw 'Character format fixture timed out.' }
  $diagnostics=$fixture.StandardError.ReadToEnd()
  if ($fixture.ExitCode) { throw $diagnostics }
  Get-Content -LiteralPath (Join-Path $output 'format-smoke.json') -Raw -Encoding UTF8
} finally { $fixture.Dispose() }
