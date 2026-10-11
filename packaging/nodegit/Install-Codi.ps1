param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'

try {
    $manifestPath = Join-Path $PSScriptRoot 'release.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Invalid release metadata: release.json is missing.' }
    $release = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($release.version -notmatch '^\d+\.\d+\.\d+$' -or $release.commit -notmatch '^[a-fA-F0-9]{40}$') {
        throw 'Invalid release metadata: expected a version and pinned commit.'
    }
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Codi requires 64-bit Windows.' }

    $nodeCommand = Get-Command node.exe -ErrorAction Stop
    $nodePath = $nodeCommand.Source
    $nodeVersion = & $nodePath --version
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 24) {
        throw 'Codi requires Node.js 24 or later on PATH.'
    }
    $npmCli = Join-Path (Split-Path -Parent $nodePath) 'node_modules\npm\bin\npm-cli.js'
    if (-not (Test-Path -LiteralPath $npmCli -PathType Leaf)) {
        throw 'npm was not found beside Node.js. Install a complete Node.js 24 distribution.'
    }
    $gitPath = (Get-Command git.exe -ErrorAction Stop).Source
    & $gitPath --version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Git could not start.' }
    Write-Output ('Ready: Node.js ' + $nodeVersion + ', Git, Codi ' + $release.version)
    if ($VerifyOnly) { exit 0 }

    $pluginsRoot = Join-Path $env:USERPROFILE 'plugins'
    $sourceRoot = Join-Path $pluginsRoot 'codex-quota-widget'
    if (Test-Path -LiteralPath $sourceRoot) {
        throw ('Codi source already exists at ' + $sourceRoot + '. Use Codi Settings > Quota > Check for updates > Update now. Do not overwrite it.')
    }
    [IO.Directory]::CreateDirectory($pluginsRoot) | Out-Null
    $tag = 'v' + $release.version
    & $gitPath clone --depth 1 --single-branch --branch $tag 'https://github.com/Chester-chs/Codi.git' $sourceRoot
    if ($LASTEXITCODE -ne 0) { throw 'Could not download the Codi release with Git.' }
    $head = (& $gitPath -C $sourceRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $head -ine $release.commit) { throw 'Downloaded release commit does not match this installer. Installation stopped.' }
    $packageVersion = (Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
    if ($packageVersion -ne $release.version) { throw 'Downloaded package version does not match this installer. Installation stopped.' }
    & (Join-Path $sourceRoot 'scripts\install.ps1')
    if (-not $?) { throw 'Codi installation failed. See the error above; your downloaded source remains in place.' }
    Write-Output 'Codi installed. Fully quit and reopen Codex, then start a new chat.'
} catch {
    Write-Error $_
    exit 1
}
