param([Parameter(Mandatory=$true)][string]$PayloadRoot,[switch]$VerifyOnly)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$payload=[IO.Path]::GetFullPath($PayloadRoot)
$app=Join-Path $payload 'app'
$nodeZip=Join-Path $payload 'node-v24.19.0-win-x64.zip'
$expectedNodeHash='57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73'
foreach($file in @((Join-Path $app 'package.json'),(Join-Path $app 'scripts\install.ps1'),(Join-Path $app '.codex-plugin\plugin.json'),$nodeZip)) {
    if(-not(Test-Path -LiteralPath $file -PathType Leaf)){throw "Installation package is incomplete: $file"}
}
$stream=[IO.File]::OpenRead($nodeZip)
try {
    $sha=[Security.Cryptography.SHA256]::Create()
    try { $nodeHash=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
} finally { $stream.Dispose() }
if($nodeHash -ne $expectedNodeHash){throw 'Bundled Node.js archive failed SHA-256 verification.'}
$package=Get-Content -LiteralPath (Join-Path $app 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if($package.name -ne 'codex-quota-widget' -or $package.version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid application package identity.'}
if($VerifyOnly){Write-Output ('Package verified: Codi '+$package.version+'; official Node.js v24.19.0 checksum matches.');return}
if([Environment]::Is64BitOperatingSystem -ne $true){throw 'Codi requires 64-bit Windows.'}
$sourceRoot=Join-Path $env:USERPROFILE 'plugins\codex-quota-widget'
$codexRoot=if($env:CODEX_HOME){[IO.Path]::GetFullPath($env:CODEX_HOME)}else{Join-Path $env:USERPROFILE '.codex'}
$dataRoot=Join-Path $codexRoot 'codex-quota-widget'
$nodeRoot=Join-Path $dataRoot 'node-runtime'
if(Test-Path -LiteralPath $sourceRoot){throw 'Codi source already exists. Use Codi Settings → Check for updates, so existing work is preserved.'}
if(Test-Path -LiteralPath $nodeRoot){throw 'Codi Node runtime already exists. Use Codi Settings → Check for updates.'}
[IO.Directory]::CreateDirectory((Split-Path -Parent $sourceRoot))|Out-Null
[IO.Directory]::CreateDirectory($dataRoot)|Out-Null
$extract=Join-Path $payload 'node-extracted'
[IO.Compression.ZipFile]::ExtractToDirectory($nodeZip,$extract)
$extractedRoot=Join-Path $extract 'node-v24.19.0-win-x64'
$node=Join-Path $extractedRoot 'node.exe'
$npm=Join-Path $extractedRoot 'node_modules\npm\bin\npm-cli.js'
if(-not(Test-Path -LiteralPath $node -PathType Leaf) -or -not(Test-Path -LiteralPath $npm -PathType Leaf)){throw 'Bundled Node.js archive is incomplete.'}
if((& $node --version) -ne 'v24.19.0' -or $LASTEXITCODE){throw 'Bundled Node.js cannot run on this computer.'}
try {
    Copy-Item -LiteralPath $app -Destination $sourceRoot -Recurse
    Move-Item -LiteralPath $extractedRoot -Destination $nodeRoot
    Write-Output 'Installing Codi. Electron will be downloaded; this can take several minutes.'
    & (Join-Path $sourceRoot 'scripts\install.ps1')
    if($LASTEXITCODE){throw 'Codi installation failed.'}
    Write-Output 'Codi installed. Fully quit and reopen Codex, then start a new chat.'
} catch {
    Write-Error $_
    throw
}
