$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourceRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid package version.' }
$tag = 'v' + $version
$remoteTag = & git -C $sourceRoot ls-remote --tags origin ('refs/tags/' + $tag)
if ($LASTEXITCODE -ne 0 -or -not $remoteTag) { throw ('Published tag ' + $tag + ' was not found on origin.') }
$commit = ($remoteTag -split '\s+')[0]
if ($commit -notmatch '^[a-fA-F0-9]{40}$') { throw 'Published tag commit is invalid.' }
$dist = Join-Path $sourceRoot 'dist'
[IO.Directory]::CreateDirectory($dist) | Out-Null
$stage = Join-Path $dist ('nodegit-' + [guid]::NewGuid().ToString('N'))
$zip = Join-Path $dist ('CodexOshi-Node24-Git-' + $version + '.zip')
try {
    [IO.Directory]::CreateDirectory($stage) | Out-Null
    foreach ($name in @('Install-CodexOshi.ps1', 'Install-CodexOshi.cmd', 'README.txt')) {
        Copy-Item -LiteralPath (Join-Path $sourceRoot ('packaging\nodegit\' + $name)) -Destination $stage
    }
    $manifest = @{ version = $version; commit = $commit } | ConvertTo-Json
    [IO.File]::WriteAllText((Join-Path $stage 'release.json'), $manifest, (New-Object Text.UTF8Encoding($false)))
    if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
    [IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip, [IO.Compression.CompressionLevel]::Optimal, $false)
} finally {
    $fullStage = [IO.Path]::GetFullPath($stage)
    $fullDist = [IO.Path]::GetFullPath($dist).TrimEnd('\', '/')
    if ($fullStage.StartsWith($fullDist + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $stage)) {
        Remove-Item -LiteralPath $stage -Recurse -Force
    }
}
$files = @((Join-Path $dist ('CodexOshi-Setup-' + $version + '-win-x64.exe')), $zip) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
$checksums = foreach ($file in $files) { (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + (Split-Path -Leaf $file) }
[IO.File]::WriteAllText((Join-Path $dist 'SHA256SUMS.txt'), (($checksums -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
Write-Output ([pscustomobject]@{ package = $zip; bytes = (Get-Item -LiteralPath $zip).Length; sha256 = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant(); version = $version; commit = $commit } | ConvertTo-Json)
