function Close-CodiBridge {
    param($Writer,$Pipe)
    if ($Writer) {
        try { $Writer.Dispose() } catch { }
    }
    if ($Pipe) {
        try { $Pipe.Dispose() } catch { }
    }
}

function Send-CodiBridge {
    param($Writer,[string]$Message)
    if (-not $Writer) { return $false }
    try { $Writer.WriteLine($Message); return $true } catch { return $false }
}

function Read-CodiBridgeCandidate {
    param([string]$Path)
    try {
        if (-not (Test-Path -LiteralPath $Path)) { return $null }
        return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
    } catch { return $null }
}
