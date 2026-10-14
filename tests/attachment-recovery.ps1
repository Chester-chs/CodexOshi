$ErrorActionPreference='Stop'
. (Join-Path (Split-Path -Parent $PSScriptRoot) 'desktop\bridge-cleanup.ps1')
Add-Type @'
public static class QuotaWindows {
    public static bool Running=true, Available=true;
    public static int Calls;
    public static bool IsFollowing(){return Running;}
    public static bool Attach(long overlay,long host){Calls++;Running=Available;return true;}
}
'@
$now=[DateTime]::UtcNow
$state=Update-CodiAttachment -Overlay 2 -HostWindow '1' -Attached '1' -LastAttempt $now.AddSeconds(-2) -Now $now
if([QuotaWindows]::Calls -ne 0){throw 'A healthy attachment was restarted.'}
[QuotaWindows]::Running=$false
[QuotaWindows]::Available=$false
$state=Update-CodiAttachment -Overlay 2 -HostWindow '1' -Attached $state.window -LastAttempt $state.lastAttempt -Now $now
if([QuotaWindows]::Calls -ne 1 -or $state.window -ne ''){throw 'A dead follower on the same host was not retried, or a failed hook was treated as attached.'}
$state=Update-CodiAttachment -Overlay 2 -HostWindow '1' -Attached $state.window -LastAttempt $state.lastAttempt -Now $now.AddMilliseconds(100)
if([QuotaWindows]::Calls -ne 1){throw 'Failed hooks were retried without backoff.'}
[QuotaWindows]::Available=$true
$state=Update-CodiAttachment -Overlay 2 -HostWindow '1' -Attached $state.window -LastAttempt $state.lastAttempt -Now $now.AddSeconds(1)
if([QuotaWindows]::Calls -ne 2 -or $state.window -ne '1' -or -not [QuotaWindows]::Running){throw 'Follower did not recover on the same host.'}
Write-Output 'attachment recovery passed'
