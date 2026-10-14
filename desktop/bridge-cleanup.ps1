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

function Update-CodiAttachment {
    param([long]$Overlay,[string]$HostWindow,[string]$Attached,[DateTime]$LastAttempt,[DateTime]$Now=[DateTime]::UtcNow)
    if ($Overlay -and $HostWindow -and $HostWindow -ne '0' -and
        ($Attached -ne $HostWindow -or -not [QuotaWindows]::IsFollowing()) -and
        ($Now-$LastAttempt).TotalMilliseconds -ge 1000) {
        $LastAttempt=$Now
        if ([QuotaWindows]::Attach($Overlay,[long]$HostWindow) -and [QuotaWindows]::IsFollowing()) { $Attached=$HostWindow }
        else { $Attached='' }
    }
    return @{window=$Attached;lastAttempt=$LastAttempt}
}

function Read-CodiBridgeCandidate {
    param([string]$Path)
    try {
        if (-not (Test-Path -LiteralPath $Path)) { return $null }
        return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
    } catch { return $null }
}
