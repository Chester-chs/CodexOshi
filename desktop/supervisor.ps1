param([Parameter(Mandatory=$true)][string]$DataDir)
$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'WindowApi.cs')
[QuotaWindows]::DetachConsole()
$utf8 = New-Object Text.UTF8Encoding($false)
$process = $null
$attached = ''
$errorTask = $null
$pipe = $null
$writer = $null
$bridge = $null
$overlay = 0L
$lastStart = [DateTime]::MinValue
$lastState = ''
$heartbeat = [DateTime]::MinValue
$stopFile = Join-Path $DataDir 'stop.request'
if (Test-Path -LiteralPath $stopFile) { Remove-Item -LiteralPath $stopFile }
try {
    while (-not (Test-Path -LiteralPath $stopFile)) {
        $enabledFile = Join-Path $DataDir 'enabled.json'
        $enabled = (Test-Path -LiteralPath $enabledFile) -and ((Get-Content -LiteralPath $enabledFile -Raw | ConvertFrom-Json).enabled -eq $true)
        $hostState = [QuotaWindows]::Probe()
        $hostState['nativeInput']=[QuotaWindows]::FollowMetrics()
        if ($process -and $process.HasExited) {
            [QuotaWindows]::StopFollowing()
            if ($writer) { $writer.Dispose(); $writer=$null }
            if ($pipe) { $pipe.Dispose(); $pipe=$null }
            if ($errorTask.IsCompleted) { [IO.File]::WriteAllText((Join-Path $DataDir 'desktop-error.log'),$errorTask.Result,$utf8) }
            $process.Dispose(); $process=$null; $overlay=0L; $attached=''
        }
        if ($enabled -and $hostState.hostAlive -and -not $process -and ([DateTime]::UtcNow-$lastStart).TotalSeconds -ge 4) {
            $lastStart=[DateTime]::UtcNow
            $start=New-Object Diagnostics.ProcessStartInfo
            $start.FileName=Join-Path $DataDir 'desktop-runtime\node_modules\electron\dist\electron.exe'
            $start.Arguments='"'+(Join-Path $PSScriptRoot 'main.cjs')+'" --data "'+$DataDir+'"'
            $start.UseShellExecute=$false; $start.CreateNoWindow=$true
            $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
            $start.EnvironmentVariables.Remove('ELECTRON_RUN_AS_NODE')
            $process=New-Object Diagnostics.Process
            $process.StartInfo=$start
            if (-not $process.Start()) { throw 'Electron did not start.' }
            $errorTask=$process.StandardError.ReadToEndAsync()
            $lastState=''
        }
        if ($process -and -not $process.HasExited) {
            if (-not $enabled -or -not $hostState.hostAlive) {
                if ($writer) { $writer.WriteLine((@{token=$bridge.token;state=@{stop=$true}} | ConvertTo-Json -Compress)) }
            } else {
                if (-not $pipe -and (Test-Path -LiteralPath (Join-Path $DataDir 'bridge.json'))) {
                    $candidate=Get-Content -LiteralPath (Join-Path $DataDir 'bridge.json') -Raw | ConvertFrom-Json
                    if ($candidate.pid -eq $process.Id) {
                        $bridge=$candidate
                        $pipe=New-Object IO.Pipes.NamedPipeClientStream('.', $bridge.pipe, [IO.Pipes.PipeDirection]::Out)
                        $pipe.Connect(1000)
                        $writer=New-Object IO.StreamWriter($pipe,$utf8)
                        $writer.AutoFlush=$true
                        $overlay=[long]$bridge.hwnd
                        [QuotaWindows]::ConfigureOverlay($overlay) | Out-Null
                    }
                }
                if ($overlay -and $hostState.window -ne '0' -and $attached -ne $hostState.window) {
                    if ([QuotaWindows]::Attach($overlay,[long]$hostState.window)) { $attached=$hostState.window }
                }
                $hostState['attached']=($attached -eq $hostState.window -and [QuotaWindows]::IsFollowing())
                $hostState['revision']=[QuotaWindows]::VisibilityRevision()
                $hostState['nativeWheel']=[QuotaWindows]::DrainWheels()
                $hostState['outsideClick']=[QuotaWindows]::DrainOutsideClick()
                $hostState.Remove('mouseButtons'); $hostState.Remove('mouseSampleAt')
                # Ordinary location changes stay native; Chromium only needs dimensions / DPI.
                $hostState.bounds = @{width=$hostState.bounds.width;height=$hostState.bounds.height}
                $serialized=$hostState | ConvertTo-Json -Depth 6 -Compress
                if ($writer -and ($serialized -ne $lastState -or ([DateTime]::UtcNow-$heartbeat).TotalSeconds -ge 1)) {
                    $writer.WriteLine((@{token=$bridge.token;state=$hostState} | ConvertTo-Json -Depth 8 -Compress))
                    $lastState=$serialized; $heartbeat=[DateTime]::UtcNow
                }
            }
        }
        Start-Sleep -Milliseconds 100
    }
} finally {
    [QuotaWindows]::StopFollowing()
    if ($process -and -not $process.HasExited) {
        try { if ($writer) { $writer.WriteLine((@{token=$bridge.token;state=@{stop=$true}} | ConvertTo-Json -Compress)) } } catch {}
        if (-not $process.WaitForExit(3000)) { $process.Kill() }
    }
    if ($process) { $process.Dispose() }
    if ($writer) { $writer.Dispose() }
    if ($pipe) { $pipe.Dispose() }
}
