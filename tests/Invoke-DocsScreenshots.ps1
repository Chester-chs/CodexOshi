. (Join-Path $PSScriptRoot '../scripts/common.ps1')
$output=Join-Path $DataRoot 'docs-screenshots'
[IO.Directory]::CreateDirectory($output)|Out-Null
$fixtureData=Join-Path $output 'data'
if(Test-Path -LiteralPath $fixtureData){Remove-Item -LiteralPath $fixtureData -Recurse -Force}
$electron=Join-Path $DataRoot 'desktop-runtime\node_modules\electron\dist\electron.exe'
$start=New-Object Diagnostics.ProcessStartInfo
$start.FileName=$electron
$start.Arguments='"'+(Join-Path $SourceRoot 'tests\docs-screenshots.cjs')+'" --output "'+$output+'"'
$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardError=$true;$start.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
$process=New-Object Diagnostics.Process;$process.StartInfo=$start
try{
    $process.Start()|Out-Null
    if(-not $process.WaitForExit(30000)){$process.Kill();throw 'Documentation screenshot capture timed out.'}
    if($process.ExitCode){throw $process.StandardError.ReadToEnd()}
    foreach($image in @('companion.png','quota.png','token-30-days.png','appearance.png')){
        Copy-Item -LiteralPath (Join-Path $output $image) -Destination (Join-Path $SourceRoot ('docs\images\codi-'+$image))
    }
    & (Join-Path $PSScriptRoot 'Invoke-NewsSmoke.ps1') | Out-Null
    Copy-Item -LiteralPath (Join-Path $DataRoot 'news-ui\update-available-en.png') -Destination (Join-Path $SourceRoot 'docs\images\one-click-update.png')
    Write-Output 'Documentation screenshots refreshed.'
}finally{$process.Dispose()}
