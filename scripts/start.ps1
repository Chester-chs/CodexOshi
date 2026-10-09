. (Join-Path $PSScriptRoot 'common.ps1')
if (-not (Test-Path -LiteralPath (Join-Path $DataRoot 'desktop-runtime\node_modules\electron\dist\electron.exe'))) { throw 'Install the plugin first.' }
Write-JsonAtomic (Join-Path $DataRoot 'enabled.json') @{enabled=$true}
$launcher=Build-Launcher
Start-Process -FilePath $launcher -ArgumentList ('--script "'+(Join-Path $SourceRoot 'desktop\supervisor.ps1')+'" --data "'+$DataRoot+'"') -WindowStyle Hidden
Write-Output 'Codex quota widget monitor started.'
