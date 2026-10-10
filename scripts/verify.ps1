param([switch]$Native)
. (Join-Path $PSScriptRoot 'common.ps1')
$node=(Get-Command node.exe -ErrorAction Stop).Source
$tests=@(Get-ChildItem -LiteralPath (Join-Path $SourceRoot 'tests') -Filter '*.test.cjs' | ForEach-Object FullName)
& $node --test @tests
if ($LASTEXITCODE) { throw 'Unit tests failed.' }
$sourceFiles=@(& git -C $SourceRoot ls-files --cached --others --exclude-standard)
$forbidden=@($sourceFiles | Where-Object { $_ -match '(^|/)(auth\.json|node_modules|userdata|cache|dist|build|characters|assets/user|assets/uploads)(/|$)|\.token$|(^|/)\.env' })
if ($forbidden.Count) { throw ('Forbidden source files: '+($forbidden -join ', ')) }
if ($Native) {
    Add-Type -Path (Join-Path $SourceRoot 'desktop\WindowApi.cs')
    $output=Join-Path $DataRoot 'shape-smoke.json'
    if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output }
    $electron=Join-Path $DataRoot 'desktop-runtime\node_modules\electron\dist\electron.exe'
    $start=New-Object Diagnostics.ProcessStartInfo
    $start.FileName=$electron
    $start.Arguments='"'+(Join-Path $SourceRoot 'desktop\shape-smoke.cjs')+'" --output "'+$output+'"'
    $start.UseShellExecute=$false; $start.CreateNoWindow=$true
    $start.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
    $fixture=New-Object Diagnostics.Process
    $fixture.StartInfo=$start
    try {
        $fixture.Start() | Out-Null
        $deadline=[DateTime]::UtcNow.AddSeconds(10)
        while (-not (Test-Path -LiteralPath $output) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
        $smoke=Get-Content -LiteralPath $output -Raw | ConvertFrom-Json
        $audit=[QuotaWindows]::Audit([long]$smoke.hwnd)
        $physicalLimit=[Math]::Ceiling($audit.dpi/96.0)
        if ($audit.regionKind -ne 2 -or $audit.region.width -gt $physicalLimit -or $audit.region.height -gt $physicalLimit -or $audit.region.width -lt 1 -or $audit.region.height -lt 1) { throw 'Native region did not remain 1 DIP square.' }
        [pscustomobject]@{check='real-Electron-shape-fallback';cases=$smoke.cases;region=$audit.region;visible=$audit.visible} | ConvertTo-Json -Depth 5
    } finally { if (-not $fixture.HasExited) { $fixture.Kill() }; $fixture.Dispose() }
}
Write-Output 'Automated checks passed. Live click, drag, host input and cross-DPI behavior still require separate evidence.'
