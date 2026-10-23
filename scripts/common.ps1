$ErrorActionPreference = 'Stop'
$SourceRoot = Split-Path -Parent $PSScriptRoot
$CodexRoot = if ($env:CODEX_HOME) { [IO.Path]::GetFullPath($env:CODEX_HOME) } else { Join-Path $env:USERPROFILE '.codex' }
$DataRoot = Join-Path $CodexRoot 'codex-quota-widget'
$Utf8 = New-Object Text.UTF8Encoding($false)
function Write-JsonAtomic($Path,$Value) {
    $temp = "$Path.$PID.tmp"
    [IO.File]::WriteAllText($temp,($Value | ConvertTo-Json -Depth 20),$Utf8)
    if ([IO.File]::Exists($Path)) {
        $backup = "$Path.$PID.bak"
        [IO.File]::Replace($temp,$Path,$backup)
        [IO.File]::Delete($backup)
    } else { [IO.File]::Move($temp,$Path) }
}
function Get-CodexExecutable {
    $bundled = @(Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin') -Filter codex.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    if ($bundled.Count) { return $bundled[0].FullName }
    $npmExe = Join-Path $env:APPDATA 'npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe'
    if (Test-Path -LiteralPath $npmExe) { return $npmExe }
    throw 'Codex executable not found.'
}
function Assert-CodiChildPath {
    param([string]$Path,[string]$Parent)
    if (-not $Path -or -not $Parent) { throw 'A bounded path is required.' }
    $full=[IO.Path]::GetFullPath($Path).TrimEnd('\','/')
    $base=[IO.Path]::GetFullPath($Parent).TrimEnd('\','/')
    if (-not $full.StartsWith($base+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Path is outside its allowed directory.' }
    $item=$full
    while ($item.Length -ge $base.Length) {
        if ((Test-Path -LiteralPath $item) -and ((Get-Item -LiteralPath $item -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Reparse points are not supported for update paths.' }
        if ($item -eq $base) { break }
        $item=Split-Path -Parent $item
    }
    return $full
}
function Get-CodiActiveRoot {
    param([string]$DataDirectory=$DataRoot,[string]$FallbackRoot=$SourceRoot)
    try {
        $receipt=Get-Content -LiteralPath (Join-Path $DataDirectory 'installation.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($receipt.activeRoot) {
            $root=Assert-CodiChildPath $receipt.activeRoot (Join-Path $DataDirectory 'releases')
            if ((Split-Path -Parent $root) -ne (Join-Path $DataDirectory 'releases')) { throw 'Release must be a direct child.' }
            if (Test-Path -LiteralPath (Join-Path $root 'desktop\supervisor.ps1') -PathType Leaf) { return $root }
        }
    } catch { }
    return $FallbackRoot
}
function Get-CodiSourceHash {
    param([string]$Path)
    $sha=[Security.Cryptography.SHA256]::Create();$stream=[IO.File]::OpenRead($Path)
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').Substring(0,16) }
    finally { $stream.Dispose();$sha.Dispose() }
}
function Get-CodiWindowApiCache {
    param([string]$Root=$SourceRoot,[string]$DataDirectory=$DataRoot)
    $hash=Get-CodiSourceHash (Join-Path $Root 'desktop\WindowApi.cs')
    return Join-Path $DataDirectory ('native\QuotaWindows-'+$hash+'.dll')
}
function Build-CodiWindowApi {
    param([string]$Root=$SourceRoot,[string]$DataDirectory=$DataRoot)
    $assembly=Get-CodiWindowApiCache -Root $Root -DataDirectory $DataDirectory
    if (-not (Test-Path -LiteralPath $assembly)) {
        [IO.Directory]::CreateDirectory((Split-Path -Parent $assembly)) | Out-Null
        $temporary=$assembly+'.'+$PID+'.tmp.dll'
        $compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
        try {
            & $compiler /nologo /target:library /platform:x64 /optimize+ /reference:System.Core.dll "/out:$temporary" (Join-Path $Root 'desktop\WindowApi.cs') | Out-Null
            if ($LASTEXITCODE) { throw 'Window API compilation failed.' }
            if (-not (Test-Path -LiteralPath $assembly)) { [IO.File]::Move($temporary,$assembly) }
        } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
    }
    return $assembly
}
function Import-CodiWindowApi {
    param([string]$Root=$SourceRoot,[string]$DataDirectory=$DataRoot)
    $assembly=Get-CodiWindowApiCache -Root $Root -DataDirectory $DataDirectory
    if (-not (Test-Path -LiteralPath $assembly)) {
        # Older updaters do not prebuild this assembly; migrate on first launch.
        try { Build-CodiWindowApi -Root $Root -DataDirectory $DataDirectory | Out-Null } catch { }
    }
    if (Test-Path -LiteralPath $assembly) {
        try { Add-Type -Path $assembly; return } catch { }
    }
    # Source launches and a damaged local cache remain usable.
    Add-Type -Path (Join-Path $Root 'desktop\WindowApi.cs')
}
function Import-CodiComposerObserver {
    param([string]$Root=$SourceRoot,[string]$DataDirectory=$DataRoot)
    $source=Join-Path $Root 'desktop\ComposerObserver.cs'
    $hash=Get-CodiSourceHash $source
    $assembly=Join-Path $DataDirectory ('native\ComposerObserver-'+$hash+'.dll')
    if (-not (Test-Path -LiteralPath $assembly)) {
        [IO.Directory]::CreateDirectory((Split-Path -Parent $assembly)) | Out-Null
        $temporary=$assembly+'.'+$PID+'.tmp.dll'
        $framework=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
        $references=@('UIAutomationClient.dll','UIAutomationTypes.dll','WindowsBase.dll') | ForEach-Object { '/reference:'+(Join-Path $framework ('WPF\'+$_)) }
        try {
            & (Join-Path $framework 'csc.exe') /nologo /target:library /platform:x64 /optimize+ @references "/out:$temporary" $source | Out-Null
            if ($LASTEXITCODE) { throw 'Composer observer compilation failed.' }
            if (-not (Test-Path -LiteralPath $assembly)) { [IO.File]::Move($temporary,$assembly) }
        } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
    }
    Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,WindowsBase
    Add-Type -Path $assembly
}
function Build-Launcher {
    param([string]$Root=$SourceRoot,[string]$DataDirectory=$DataRoot)
    Build-CodiWindowApi -Root $Root -DataDirectory $DataDirectory | Out-Null
    Import-CodiComposerObserver -Root $Root -DataDirectory $DataDirectory
    $source = Join-Path $Root 'desktop\WidgetLauncher.cs'
    $hash = Get-CodiSourceHash $source
    $native = Join-Path $DataDirectory 'native'
    [IO.Directory]::CreateDirectory($native) | Out-Null
    $exe = Join-Path $native "QuotaLauncher-$hash.exe"
    if (-not (Test-Path -LiteralPath $exe)) {
        $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
        & $compiler /nologo /target:winexe /platform:x64 /optimize+ /reference:System.Web.Extensions.dll "/out:$exe" $source
        if ($LASTEXITCODE) { throw 'Windows C# launcher compilation failed.' }
    }
    return $exe
}
function New-CodiTaskSettings {
    return New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 20 -RestartInterval (New-TimeSpan -Minutes 1)
}
function Start-CodiMonitor {
    param([string]$Root=$SourceRoot,[string]$DataDirectory=$DataRoot)
    if (-not (Test-Path -LiteralPath (Join-Path $DataDirectory 'desktop-runtime\node_modules\electron\dist\electron.exe'))) { throw 'Install the plugin first.' }
    Write-JsonAtomic (Join-Path $DataDirectory 'enabled.json') @{enabled=$true}
    $launcher=Build-Launcher -Root $Root -DataDirectory $DataDirectory
    Start-Process -FilePath $launcher -ArgumentList ('--script "'+(Join-Path $Root 'desktop\supervisor.ps1')+'" --data "'+$DataDirectory+'"') -WindowStyle Hidden
}
