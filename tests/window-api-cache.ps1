$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\common.ps1')
$testRoot=Join-Path $env:TEMP ('codi-api-cache-'+[guid]::NewGuid().ToString('N'))
$fixture=Join-Path $testRoot 'app'
$desktop=Join-Path $fixture 'desktop'
[IO.Directory]::CreateDirectory($desktop)|Out-Null
Copy-Item -LiteralPath (Join-Path $SourceRoot 'desktop\WindowApi.cs') -Destination $desktop
try {
    $common=Join-Path $SourceRoot 'scripts\common.ps1'
    $load=". '$common'; Import-CodiWindowApi -Root '$fixture' -DataDirectory '$testRoot'; if(-not ('QuotaWindows' -as [type])) {exit 1}"
    & powershell.exe -NoProfile -Command $load
    if($LASTEXITCODE){throw 'First launch after an older updater failed.'}
    if(-not(Test-Path -LiteralPath (Join-Path $testRoot 'native'))){throw 'First launch did not persist a native cache for the old updater migration.'}
    $first=Build-CodiWindowApi -Root $fixture -DataDirectory $testRoot
    if(-not(Test-Path -LiteralPath $first)){throw 'Window API was not compiled.'}
    $timestamp=(Get-Item -LiteralPath $first).LastWriteTimeUtc
    $second=Build-CodiWindowApi -Root $fixture -DataDirectory $testRoot
    if($second -ne $first -or (Get-Item -LiteralPath $second).LastWriteTimeUtc -ne $timestamp){throw 'Unchanged API was rebuilt instead of reusing its assembly.'}
    [IO.File]::AppendAllText((Join-Path $desktop 'WindowApi.cs'),"`n// changed fixture source`n")
    $changed=Build-CodiWindowApi -Root $fixture -DataDirectory $testRoot
    if($changed -eq $first){throw 'A changed API reused stale compiled code.'}
    $common=Join-Path $SourceRoot 'scripts\common.ps1'
    $load=". '$common'; Import-CodiWindowApi -Root '$fixture' -DataDirectory '$testRoot'; if(-not ('QuotaWindows' -as [type])) {exit 1}"
    & powershell.exe -NoProfile -Command $load
    if($LASTEXITCODE){throw 'Compiled API cannot be loaded.'}
    [IO.File]::WriteAllText($changed,'damaged cache')
    & powershell.exe -NoProfile -Command $load
    if($LASTEXITCODE){throw 'Damaged cache prevented source fallback.'}
    Write-Output 'window API cache passed'
} finally {
    $resolved=[IO.Path]::GetFullPath($testRoot)
    if((Split-Path -Parent $resolved) -eq [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') -and (Split-Path -Leaf $resolved) -like 'codi-api-cache-*') {Remove-Item -LiteralPath $resolved -Recurse -Force}
}
