. (Join-Path $PSScriptRoot 'common.ps1')
& (Join-Path $PSScriptRoot 'stop.ps1')
$task=Get-ScheduledTask -TaskName 'Codex Quota Widget' -ErrorAction SilentlyContinue
if ($task) { Unregister-ScheduledTask -TaskName 'Codex Quota Widget' -Confirm:$false }
$receiptFile=Join-Path $DataRoot 'installation.json'
if (-not (Test-Path -LiteralPath $receiptFile)) { throw 'Installation receipt missing; marketplace left unchanged.' }
$receipt=Get-Content -LiteralPath $receiptFile -Raw | ConvertFrom-Json
$codex=Get-CodexExecutable
& $codex plugin remove ('codex-quota-widget@'+$receipt.marketplace)
if ($LASTEXITCODE) { throw 'Codex plugin removal failed.' }
$marketFile=Join-Path $env:USERPROFILE '.agents\plugins\marketplace.json'
$market=Get-Content -LiteralPath $marketFile -Raw | ConvertFrom-Json
$market.plugins=@($market.plugins | Where-Object name -ne 'codex-quota-widget')
Write-JsonAtomic $marketFile $market
Write-Output 'Plugin removed. User data has been retained.'
