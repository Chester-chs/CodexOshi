. (Join-Path $PSScriptRoot '../scripts/common.ps1')
$output=Join-Path $DataRoot 'drag-io-native'
[IO.Directory]::CreateDirectory($output) | Out-Null
foreach($before in @($true,$false)) {
  $start=New-Object Diagnostics.ProcessStartInfo
  $start.FileName=Join-Path $DataRoot 'desktop-runtime/node_modules/electron/dist/electron.exe'
  $start.Arguments='"'+(Join-Path $SourceRoot 'tests/drag-main-smoke.cjs')+'" --output "'+$output+'"'+$(if($before){' --before'}else{''})
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardError=$true;$start.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
  $fixture=New-Object Diagnostics.Process;$fixture.StartInfo=$start
  try {
    $fixture.Start() | Out-Null
    if(-not $fixture.WaitForExit(30000)){$fixture.Kill();throw 'Drag I/O fixture timed out.'}
    $errorText=$fixture.StandardError.ReadToEnd();if($fixture.ExitCode){throw $errorText}
    Get-Content -LiteralPath (Join-Path $output $(if($before){'before.json'}else{'after.json'})) -Raw -Encoding UTF8
  } finally {$fixture.Dispose()}
}
