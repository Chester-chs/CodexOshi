param([switch]$NoStartup,[switch]$NoStart)
. (Join-Path $PSScriptRoot 'common.ps1')
if ($SourceRoot -ne (Join-Path $env:USERPROFILE 'plugins\codex-quota-widget')) { throw 'Install only from the stable source directory: ~/plugins/codex-quota-widget' }
if ([IO.Path]::GetFullPath($DataRoot).StartsWith($SourceRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Source and user data directories must be separate.' }
[IO.Directory]::CreateDirectory($DataRoot) | Out-Null
& (Join-Path $PSScriptRoot 'stop.ps1')
$runtime=Join-Path $DataRoot 'desktop-runtime'
[IO.Directory]::CreateDirectory($runtime) | Out-Null
Copy-Item -LiteralPath (Join-Path $SourceRoot 'package.json'),(Join-Path $SourceRoot 'package-lock.json') -Destination $runtime
$node=(Get-Command node.exe -ErrorAction Stop).Source
$npmCli=Join-Path (Split-Path -Parent $node) 'node_modules\npm\bin\npm-cli.js'
& $node $npmCli --prefix $runtime --cache (Join-Path $DataRoot 'npm-cache') ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE) { throw 'Runtime dependency installation failed.' }
& $node (Join-Path $runtime 'node_modules\electron\install.js')
if ($LASTEXITCODE) { throw 'Electron download failed.' }
$launcher=Build-Launcher
$marketDir=Join-Path $env:USERPROFILE '.agents\plugins'
[IO.Directory]::CreateDirectory($marketDir) | Out-Null
$marketFile=Join-Path $marketDir 'marketplace.json'
if (Test-Path -LiteralPath $marketFile) {
    $market=Get-Content -LiteralPath $marketFile -Raw | ConvertFrom-Json
    Copy-Item -LiteralPath $marketFile -Destination (Join-Path $DataRoot ('marketplace-backup-'+[DateTime]::UtcNow.ToString('yyyyMMddHHmmss')+'.json'))
} else { $market=[pscustomobject]@{name='personal';plugins=@()} }
if (-not $market.name -or -not ($market.PSObject.Properties.Name -contains 'plugins')) { throw 'Existing marketplace schema is unsupported; preserved without modification.' }
$entry=[pscustomobject]@{name='codex-quota-widget';source=@{source='local';path='./plugins/codex-quota-widget'};policy=@{installation='AVAILABLE';authentication='ON_INSTALL'};category='Productivity'}
$market.plugins=@($market.plugins | Where-Object name -ne 'codex-quota-widget')+@($entry)
Write-JsonAtomic $marketFile $market
$codex=Get-CodexExecutable
& $codex plugin add ('codex-quota-widget@'+$market.name) --json
if ($LASTEXITCODE) { throw 'Codex plugin installation failed.' }
Write-JsonAtomic (Join-Path $DataRoot 'installation.json') @{sourceRoot=$SourceRoot;marketplace=$market.name;installedAt=[DateTime]::UtcNow.ToString('o')}
if (-not $NoStartup) {
    $action=New-ScheduledTaskAction -Execute $launcher -Argument ('--script "'+(Join-Path $SourceRoot 'desktop\supervisor.ps1')+'" --data "'+$DataRoot+'"')
    $trigger=New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)
    $principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName 'Codex Quota Widget' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
}
if (-not $NoStart) { & (Join-Path $PSScriptRoot 'start.ps1') }
Write-Output 'Local plugin installed. Restart Codex and open a new chat to load its MCP skeleton.'
