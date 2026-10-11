. (Join-Path $PSScriptRoot 'common.ps1')
$activeRoot=Get-CodiActiveRoot
Start-CodiMonitor -Root $activeRoot
Write-Output 'Codex quota widget monitor started.'
