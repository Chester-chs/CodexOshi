param([Parameter(Mandatory=$true)][string]$DataDir,[Parameter(Mandatory=$true)][string]$JobDir)
. (Join-Path $PSScriptRoot 'common.ps1')
$DataDir=[IO.Path]::GetFullPath($DataDir).TrimEnd('\','/')
$JobDir=[IO.Path]::GetFullPath($JobDir).TrimEnd('\','/')

function Set-UpdateState($Status,$Version,$ErrorCode) {
    $state=@{status=$Status;version=$Version;updatedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds();ownerPid=$PID}
    if ($ErrorCode) { $state.error=$ErrorCode }
    Write-JsonAtomic (Join-Path $DataDir 'update-state.json') $state
}
function Assert-UpdateTree($Root) {
    foreach ($item in Get-ChildItem -LiteralPath $Root -Force -Recurse) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Update trees cannot contain reparse points.' }
    }
}
function Get-UpdatePlan {
    $bounded=Assert-CodiChildPath $JobDir (Join-Path $DataDir 'updates')
    if ((Split-Path -Parent $bounded) -ne (Join-Path $DataDir 'updates') -or (Split-Path -Leaf $bounded) -notmatch '^[A-Za-z0-9_-]{1,100}$') { throw 'Invalid update job.' }
    $plan=Get-Content -LiteralPath (Join-Path $bounded 'plan.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($plan.version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$' -or $plan.version.Length -gt 100 -or $plan.commit -notmatch '^[a-f0-9]{40}$') { throw 'Invalid update identity.' }
    $app=Assert-CodiChildPath $plan.appRoot $bounded
    if ($app -ne (Join-Path $bounded 'app')) { throw 'Invalid staged application path.' }
    if ($plan.runtimeRoot -and (Assert-CodiChildPath $plan.runtimeRoot $bounded) -ne (Join-Path $bounded 'runtime')) { throw 'Invalid staged runtime path.' }
    $receipt=Get-Content -LiteralPath (Join-Path $DataDir 'installation.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($receipt.marketplace -notmatch '^[A-Za-z0-9_-]{1,100}$') { throw 'Invalid marketplace identity.' }
    $cacheBase=Join-Path (Split-Path -Parent $DataDir) 'plugins\cache'
    $expectedCache=Join-Path $cacheBase ($receipt.marketplace+'\codex-quota-widget\0.1.0')
    if ($plan.cacheRoot -and (Assert-CodiChildPath $plan.cacheRoot $cacheBase) -ne $expectedCache) { throw 'Invalid installed plugin cache.' }
    return $plan
}
function Get-PreviousUpdateRoot($Plan,$Receipt) {
    $previous=Get-CodiActiveRoot -DataDirectory $DataDir -FallbackRoot $Receipt.sourceRoot
    if ($Plan.previousAppRoot) {
        $allowed=@([IO.Path]::GetFullPath($Receipt.sourceRoot),$previous)
        $allowed+=Join-Path (Split-Path -Parent $DataDir) ('plugins\cache\'+$Receipt.marketplace+'\codex-quota-widget\0.1.0')
        $requested=[IO.Path]::GetFullPath($Plan.previousAppRoot)
        try {
            $release=Assert-CodiChildPath $requested (Join-Path $DataDir 'releases')
            if ((Split-Path -Parent $release) -eq (Join-Path $DataDir 'releases') -and (Test-Path -LiteralPath (Join-Path $release 'desktop\supervisor.ps1') -PathType Leaf)) { $allowed+=$release }
        } catch { }
        if ($requested -notin $allowed) { throw 'Previous application path is not installed.' }
        $previous=$requested
    }
    return $previous
}
function Assert-UpdateApp($Root,$Version) {
    Assert-UpdateTree $Root
    foreach ($file in @('package.json','package-lock.json','.codex-plugin\plugin.json','.mcp.json','desktop\WidgetLauncher.cs','desktop\main.cjs','desktop\supervisor.ps1','scripts\common.ps1','scripts\start.ps1','scripts\stop.ps1','scripts\apply-update.ps1','runtime\mcp.cjs')) {
        if (-not (Test-Path -LiteralPath (Join-Path $Root $file) -PathType Leaf)) { throw 'Release files are incomplete.' }
    }
    $package=Get-Content -LiteralPath (Join-Path $Root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $manifest=Get-Content -LiteralPath (Join-Path $Root '.codex-plugin\plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($package.name -ne 'codex-quota-widget' -or $package.version -ne $Version -or $manifest.name -ne 'codex-quota-widget' -or $manifest.version -ne '0.1.0') { throw 'Release identity does not match the update.' }
}
function Copy-UpdateFile($From,$To) {
    [IO.Directory]::CreateDirectory((Split-Path -Parent $To)) | Out-Null
    $temporary=$To+'.update-'+$PID+'.tmp'
    [IO.File]::Copy($From,$temporary,$true)
    try { if ([IO.File]::Exists($To)) { [IO.File]::Replace($temporary,$To,[NullString]::Value) } else { [IO.File]::Move($temporary,$To) } }
    finally { if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) } }
}
function Save-UpdateJournal($Journal) { Write-JsonAtomic (Join-Path $JobDir 'journal.json') $Journal }
function Get-UpdateTask {
    $task=Get-ScheduledTask -TaskName 'Codex Quota Widget' -ErrorAction SilentlyContinue
    if (-not $task) { return $null }
    return @($task.Actions | ForEach-Object { @{execute=$_.Execute;arguments=$_.Arguments;workingDirectory=$_.WorkingDirectory} })
}
function Set-UpdateTask($Actions) {
    if (-not $Actions) { return }
    $task=Get-ScheduledTask -TaskName 'Codex Quota Widget' -ErrorAction SilentlyContinue
    if (-not $task) { throw 'The existing startup task was removed during the update.' }
    $nativeActions=@(foreach ($action in $Actions) {
        $parameters=@{Execute=$action.execute}
        if ($action.arguments) { $parameters.Argument=$action.arguments }
        if ($action.workingDirectory) { $parameters.WorkingDirectory=$action.workingDirectory }
        New-ScheduledTaskAction @parameters
    })
    Set-ScheduledTask -TaskName 'Codex Quota Widget' -Action $nativeActions | Out-Null
}
function Stop-UpdateMonitor {
    [IO.File]::WriteAllText((Join-Path $DataDir 'stop.request'),'stop',$Utf8)
    $deadline=[DateTime]::UtcNow.AddSeconds(12)
    $launcherPid=0
    while ([DateTime]::UtcNow -lt $deadline) {
        $file=Join-Path $DataDir 'launcher-state.json'
        if (Test-Path -LiteralPath $file) { $state=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json;$launcherPid=[int]$state.pid }
        if (-not $launcherPid -or -not (Get-Process -Id $launcherPid -ErrorAction SilentlyContinue)) { return }
        Start-Sleep -Milliseconds 100
    }
    throw 'The monitor did not stop.'
}
function Get-UpdateHostAlive {
    if (-not ('QuotaWindows' -as [type])) { Add-Type -Path (Join-Path $SourceRoot 'desktop\WindowApi.cs') }
    return [bool][QuotaWindows]::Probe().hostAlive
}
function Get-UpdateHealth($Root,$NotBefore) {
    try {
        $state=Get-Content -LiteralPath (Join-Path $DataDir 'launcher-state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([DateTime]::Parse($state.startedAt).ToUniversalTime() -lt $NotBefore -or $state.script -ne (Join-Path $Root 'desktop\supervisor.ps1') -or $state.updateHandoff -ne 1 -or -not (Get-Process -Id $state.pid -ErrorAction SilentlyContinue) -or -not (Get-Process -Id $state.supervisorPid -ErrorAction SilentlyContinue)) { return $null }
        $identity=[string]$state.pid+':'+$state.supervisorPid
        if (Get-UpdateHostAlive) {
            $version=(Get-Content -LiteralPath (Join-Path $Root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
            $window=Get-Content -LiteralPath (Join-Path $DataDir 'window-state.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            if ($window.version -ne $version -or $window.updatedAt -lt ([DateTimeOffset]$NotBefore).ToUnixTimeMilliseconds() -or $now-$window.updatedAt -ge 3500 -or $now -lt $window.updatedAt -or -not (Get-Process -Id $window.pid -ErrorAction SilentlyContinue)) { return $null }
            $identity+=':'+$window.pid
        }
        return $identity
    } catch { return $null }
}
function Wait-UpdateMonitor($Root,$NotBefore) {
    $deadline=[DateTime]::UtcNow.AddSeconds(20)
    $healthySince=$null;$previousIdentity=$null
    while ([DateTime]::UtcNow -lt $deadline) {
        $identity=Get-UpdateHealth $Root $NotBefore
        if ($identity) {
            if (-not $healthySince -or $identity -ne $previousIdentity) { $healthySince=[DateTime]::UtcNow }
            if (([DateTime]::UtcNow-$healthySince).TotalSeconds -ge 5) { return }
        } else { $healthySince=$null }
        $previousIdentity=$identity
        Start-Sleep -Milliseconds 200
    }
    throw 'The restarted monitor did not become healthy.'
}
function Restore-UpdateJournal($Journal) {
    $backup=Assert-CodiChildPath (Join-Path $JobDir 'backup') $JobDir
    $runtime=Assert-CodiChildPath (Join-Path $DataDir 'desktop-runtime') $DataDir
    Stop-UpdateMonitor
    if ($Journal.runtimeChanged -and (Test-Path -LiteralPath (Join-Path $backup 'runtime'))) {
        if (Test-Path -LiteralPath $runtime) { Remove-Item -LiteralPath $runtime -Recurse -Force }
        Move-Item -LiteralPath (Join-Path $backup 'runtime') -Destination $runtime
    }
    if ($Journal.cacheRoot) {
        foreach ($entry in $Journal.cacheFiles) {
            $target=Assert-CodiChildPath (Join-Path $Journal.cacheRoot $entry.relative) $Journal.cacheRoot
            if ($entry.existed) { Copy-UpdateFile (Assert-CodiChildPath (Join-Path (Join-Path $backup 'cache') $entry.relative) $backup) $target }
            elseif (Test-Path -LiteralPath $target -PathType Leaf) { [IO.File]::Delete($target) }
        }
    }
    Copy-UpdateFile (Join-Path $backup 'installation.json') (Join-Path $DataDir 'installation.json')
    Set-UpdateTask $Journal.taskActions
    $started=[DateTime]::UtcNow
    Start-CodiMonitor -Root $Journal.oldRoot -DataDirectory $DataDir
    Wait-UpdateMonitor $Journal.oldRoot $started
    if ($Journal.releaseRoot -and (Test-Path -LiteralPath $Journal.releaseRoot)) {
        $release=Assert-CodiChildPath $Journal.releaseRoot (Join-Path $DataDir 'releases')
        if ($release -eq $Journal.oldRoot) { throw 'Cannot remove the previous application.' }
        Remove-Item -LiteralPath $release -Recurse -Force
    }
    $Journal.phase='rolled-back';Save-UpdateJournal $Journal
}
function Invoke-CodiUpdate {
    $lock=$null;$journal=$null;$plan=$null;$oldRoot=$SourceRoot;$pending=Join-Path $DataDir 'update-pending.json';$terminal=$false
    try {
        $lock=[IO.File]::Open((Join-Path $DataDir 'update.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
        $plan=Get-UpdatePlan
        $receipt=Get-Content -LiteralPath (Join-Path $DataDir 'installation.json') -Raw -Encoding UTF8 | ConvertFrom-Json
        $oldRoot=Get-PreviousUpdateRoot $plan $receipt
        if (-not (Test-Path -LiteralPath (Join-Path $oldRoot 'desktop\supervisor.ps1') -PathType Leaf)) { throw 'Original application is unavailable.' }
        $journalFile=Join-Path $JobDir 'journal.json'
        if (Test-Path -LiteralPath $journalFile) {
            $journal=Get-Content -LiteralPath $journalFile -Raw -Encoding UTF8 | ConvertFrom-Json
            # Only replay paths derived from this plan, never paths from an unrelated journal.
            $original=Get-Content -LiteralPath (Join-Path $JobDir 'backup\installation.json') -Raw -Encoding UTF8 | ConvertFrom-Json
            $expectedRelease=Join-Path (Join-Path $DataDir 'releases') ($plan.version+'-'+$plan.commit.Substring(0,12))
            $allowedOld=@($original.sourceRoot,$original.activeRoot,(Join-Path (Split-Path -Parent $DataDir) ('plugins\cache\'+$original.marketplace+'\codex-quota-widget\0.1.0')))
            if ($journal.version -ne $plan.version -or $journal.commit -ne $plan.commit -or $journal.cacheRoot -ne $plan.cacheRoot -or $journal.releaseRoot -ne $expectedRelease -or $journal.oldRoot -notin $allowedOld) { $journal=$null;throw 'Update journal identity is invalid.' }
            if ($journal.phase -in @('complete','rolled-back')) {
                # The native launcher skips its supervisor while recovering pending
                # work, even if a previous worker reached its final journal write.
                $resumeRoot=if ($journal.phase -eq 'complete') { $journal.releaseRoot } else { $journal.oldRoot }
                $started=[DateTime]::UtcNow
                Start-CodiMonitor -Root $resumeRoot -DataDirectory $DataDir
                Wait-UpdateMonitor $resumeRoot $started
                if ($journal.phase -eq 'complete') { Set-UpdateState 'complete' $plan.version $null }
                else { Set-UpdateState 'failed' $plan.version 'install_failed' }
                $terminal=$true;return
            }
            Set-UpdateState 'installing' $plan.version $null
            Restore-UpdateJournal $journal
            Set-UpdateState 'failed' $plan.version 'install_failed';$terminal=$true;return
        }
        Set-UpdateState 'installing' $plan.version $null
        Write-JsonAtomic $pending @{jobDir=$JobDir}
        if ($plan.oldLauncherPid -gt 0) {
            $old=Get-Process -Id $plan.oldLauncherPid -ErrorAction SilentlyContinue
            if ($old -and -not $old.WaitForExit(15000)) { throw 'Previous launcher is still running.' }
        }
        Assert-UpdateApp $plan.appRoot $plan.version
        if ($plan.runtimeRoot) {
            Assert-UpdateTree $plan.runtimeRoot
            if (-not (Test-Path -LiteralPath (Join-Path $plan.runtimeRoot 'node_modules\electron\dist\electron.exe') -PathType Leaf)) { throw 'Staged runtime is incomplete.' }
        }
        $release=Assert-CodiChildPath (Join-Path (Join-Path $DataDir 'releases') ($plan.version+'-'+$plan.commit.Substring(0,12))) $DataDir
        if (Test-Path -LiteralPath $release) { throw 'Release directory already exists.' }
        # Compile before replacing anything. Both source and the old runtime stay intact.
        $launcher=Build-Launcher -Root $plan.appRoot -DataDirectory $DataDir
        $backup=Assert-CodiChildPath (Join-Path $JobDir 'backup') $JobDir
        [IO.Directory]::CreateDirectory($backup) | Out-Null
        Copy-Item -LiteralPath (Join-Path $DataDir 'installation.json') -Destination (Join-Path $backup 'installation.json')
        $cacheFiles=@()
        if ($plan.cacheRoot) {
            Assert-UpdateTree $plan.cacheRoot
            foreach ($file in Get-ChildItem -LiteralPath $plan.appRoot -Recurse -Force -File) {
                $relative=$file.FullName.Substring($plan.appRoot.Length+1)
                if ($relative -match '^(?:\.git|node_modules)(?:[\\/]|$)') { throw 'Release contains unsupported development files.' }
                $target=Assert-CodiChildPath (Join-Path $plan.cacheRoot $relative) $plan.cacheRoot
                $existed=Test-Path -LiteralPath $target -PathType Leaf
                # This is machine-specific Codex registration, not application code.
                if ($relative -eq '.mcp.json' -and $existed) { continue }
                if ($existed) { Copy-UpdateFile $target (Assert-CodiChildPath (Join-Path (Join-Path $backup 'cache') $relative) $backup) }
                $cacheFiles+=@{relative=$relative;existed=$existed}
            }
        }
        $journal=@{version=$plan.version;commit=$plan.commit;phase='prepared';oldRoot=$oldRoot;releaseRoot=$release;cacheRoot=$plan.cacheRoot;cacheFiles=$cacheFiles;runtimeChanged=[bool]$plan.runtimeRoot;taskActions=(Get-UpdateTask)}
        Save-UpdateJournal $journal
        [IO.Directory]::CreateDirectory((Split-Path -Parent $release)) | Out-Null
        Move-Item -LiteralPath (Assert-CodiChildPath $plan.appRoot $JobDir) -Destination $release
        if ($plan.runtimeRoot) {
            $runtime=Assert-CodiChildPath (Join-Path $DataDir 'desktop-runtime') $DataDir
            Move-Item -LiteralPath $runtime -Destination (Join-Path $backup 'runtime')
            Move-Item -LiteralPath (Assert-CodiChildPath $plan.runtimeRoot $JobDir) -Destination $runtime
        }
        if ($plan.cacheRoot) {
            foreach ($entry in $cacheFiles) {
                $target=Assert-CodiChildPath (Join-Path $plan.cacheRoot $entry.relative) $plan.cacheRoot
                if ($entry.relative -eq '.mcp.json') {
                    $portableNode=Join-Path $DataDir 'node-runtime\node.exe'
                    $nodeCommand=if (Test-Path -LiteralPath $portableNode -PathType Leaf) { $portableNode } else { 'node' }
                    Write-JsonAtomic $target @{mcpServers=@{'codex-quota-widget'=@{command=$nodeCommand;cwd=$plan.cacheRoot;args=@('runtime/mcp.cjs');startup_timeout_sec=10}}}
                }
                else { Copy-UpdateFile (Join-Path $release $entry.relative) $target }
            }
        }
        $receipt | Add-Member -NotePropertyName activeRoot -NotePropertyValue $release -Force
        $receipt | Add-Member -NotePropertyName updatedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o')) -Force
        Write-JsonAtomic (Join-Path $DataDir 'installation.json') $receipt
        if ($journal.taskActions) { Set-UpdateTask @(@{execute=$launcher;arguments=('--script "'+(Join-Path $release 'desktop\supervisor.ps1')+'" --data "'+$DataDir+'"');workingDirectory=$null}) }
        $journal.phase='restarting';Save-UpdateJournal $journal
        Set-UpdateState 'restarting' $plan.version $null
        $started=[DateTime]::UtcNow
        Start-CodiMonitor -Root $release -DataDirectory $DataDir
        Wait-UpdateMonitor $release $started
        $journal.phase='complete';Save-UpdateJournal $journal
        Set-UpdateState 'complete' $plan.version $null;$terminal=$true
    } catch {
        Write-Verbose ($_.Exception.Message+' '+$_.ScriptStackTrace)
        if (-not $lock) { return }
        $errorCode='install_failed'
        try {
            if ($journal -and $journal.phase -notin @('complete','rolled-back')) { Restore-UpdateJournal $journal }
            elseif (-not $journal) { $started=[DateTime]::UtcNow;Start-CodiMonitor -Root $oldRoot -DataDirectory $DataDir;Wait-UpdateMonitor $oldRoot $started }
        } catch { Write-Verbose ($_.Exception.Message+' '+$_.ScriptStackTrace);$errorCode='rollback_failed' }
        Set-UpdateState 'failed' $plan.version $errorCode
        $terminal=$errorCode -ne 'rollback_failed'
    } finally {
        if ($terminal -and (Test-Path -LiteralPath $pending)) { [IO.File]::Delete($pending) }
        if ($lock) { $lock.Dispose() }
    }
}
if ($MyInvocation.InvocationName -ne '.') { Invoke-CodiUpdate }
