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
function Build-Launcher {
    $source = Join-Path $SourceRoot 'desktop\WidgetLauncher.cs'
    $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.Substring(0,16)
    $native = Join-Path $DataRoot 'native'
    [IO.Directory]::CreateDirectory($native) | Out-Null
    $exe = Join-Path $native "QuotaLauncher-$hash.exe"
    if (-not (Test-Path -LiteralPath $exe)) {
        $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
        & $compiler /nologo /target:winexe /platform:x64 /optimize+ /reference:System.Web.Extensions.dll "/out:$exe" $source
        if ($LASTEXITCODE) { throw 'Windows C# launcher compilation failed.' }
    }
    return $exe
}
