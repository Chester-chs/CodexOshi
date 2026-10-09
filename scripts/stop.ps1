. (Join-Path $PSScriptRoot 'common.ps1')
if (Test-Path -LiteralPath $DataRoot) {
    Write-JsonAtomic (Join-Path $DataRoot 'enabled.json') @{enabled=$false}
    [IO.File]::WriteAllText((Join-Path $DataRoot 'stop.request'),'stop',$Utf8)
    $deadline = [DateTime]::UtcNow.AddSeconds(8)
    while ((Test-Path -LiteralPath (Join-Path $DataRoot 'launcher-state.json')) -and [DateTime]::UtcNow -lt $deadline) {
        $state=Get-Content -LiteralPath (Join-Path $DataRoot 'launcher-state.json') -Raw | ConvertFrom-Json
        if (-not (Get-Process -Id $state.pid -ErrorAction SilentlyContinue)) { Remove-Item -LiteralPath (Join-Path $DataRoot 'launcher-state.json'); break }
        Start-Sleep -Milliseconds 100
    }
    if (Test-Path -LiteralPath (Join-Path $DataRoot 'launcher-state.json')) { throw 'Monitor did not stop within eight seconds.' }
}
Write-Output 'Codex quota widget monitor stop requested.'
