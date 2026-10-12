$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\common.ps1')
$settings=New-CodiTaskSettings
if ($settings.RestartCount -lt 10 -or $settings.RestartInterval -ne 'PT1M' -or
    $settings.DisallowStartIfOnBatteries -or $settings.StopIfGoingOnBatteries -or
    -not $settings.StartWhenAvailable -or $settings.ExecutionTimeLimit -ne 'PT0S') {
    throw 'Startup task can still stop permanently or on battery power.'
}
Write-Output 'resilient task settings'
