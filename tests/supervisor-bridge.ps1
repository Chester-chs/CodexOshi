$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'desktop\bridge-cleanup.ps1')
$script:pipeDisposed=$false
$writer=New-Object PSObject
$writer | Add-Member -MemberType ScriptMethod -Name Dispose -Value { throw [IO.IOException]::new('Broken pipe') }
$pipe=New-Object PSObject
$pipe | Add-Member -MemberType ScriptMethod -Name Dispose -Value { $script:pipeDisposed=$true }
Close-CodiBridge -Writer $writer -Pipe $pipe
if (-not $script:pipeDisposed) { throw 'Pipe was not disposed after writer failure.' }
$broken=New-Object PSObject
$broken | Add-Member -MemberType ScriptMethod -Name WriteLine -Value { param($message) throw [IO.IOException]::new('Broken pipe') }
if (Send-CodiBridge -Writer $broken -Message 'heartbeat') { throw 'Disconnected pipe was reported healthy.' }
$script:sent=''
$healthy=New-Object PSObject
$healthy | Add-Member -MemberType ScriptMethod -Name WriteLine -Value { param($message) $script:sent=$message }
if (-not (Send-CodiBridge -Writer $healthy -Message 'heartbeat')) { throw 'Connected pipe was reported broken.' }
if ($script:sent -ne 'heartbeat') { throw 'Heartbeat was not written.' }
$candidatePath=Join-Path $env:TEMP ('codi-bridge-test-'+[guid]::NewGuid().ToString('N')+'.json')
try {
    [IO.File]::WriteAllText($candidatePath,'{"pid":')
    if (Read-CodiBridgeCandidate -Path $candidatePath) { throw 'Partial bridge metadata was accepted.' }
    [IO.File]::WriteAllText($candidatePath,'{"pid":42,"pipe":"test","token":"key","hwnd":"123"}')
    $candidate=Read-CodiBridgeCandidate -Path $candidatePath
    if (-not $candidate -or $candidate.pid -ne 42) { throw 'Valid bridge metadata was not read.' }
} finally { Remove-Item -LiteralPath $candidatePath -ErrorAction SilentlyContinue }
Write-Output 'bridge cleanup continued'
