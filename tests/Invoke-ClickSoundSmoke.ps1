param([switch]$Restart,[switch]$Custom)
. (Join-Path $PSScriptRoot '../scripts/common.ps1')
$output=Join-Path $DataRoot 'click-sound-ui'
[IO.Directory]::CreateDirectory($output)|Out-Null
$result=Join-Path $output $(if($Custom){if($Restart){'custom-restart.json'}else{'custom-sound-ui.json'}}elseif($Restart){'restart.json'}else{'click-sound-ui.json'})
if(Test-Path -LiteralPath $result){Remove-Item -LiteralPath $result}
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=Join-Path $DataRoot 'desktop-runtime/node_modules/electron/dist/electron.exe'
$start.Arguments='"'+(Join-Path $SourceRoot 'tests/click-sound-ui-smoke.cjs')+'" --output "'+$output+'"'+$(if($Restart){' --restart'}else{''})+$(if($Custom){' --custom'}else{''})
$start.UseShellExecute=$false
$start.CreateNoWindow=$true
$start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
$start.RedirectStandardError=$true
$start.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
$fixture=New-Object Diagnostics.Process
$fixture.StartInfo=$start
try{
    $fixture.Start()|Out-Null
    $errors=$fixture.StandardError.ReadToEndAsync()
    if(-not $fixture.WaitForExit(30000)){$fixture.Kill();$fixture.WaitForExit();throw 'Click sound fixture timed out'}
    if($fixture.ExitCode){throw $errors.GetAwaiter().GetResult()}
    if(-not(Test-Path -LiteralPath $result)){throw 'No fresh click sound evidence'}
    Get-Content -LiteralPath $result -Raw -Encoding UTF8
}finally{$fixture.Dispose()}
