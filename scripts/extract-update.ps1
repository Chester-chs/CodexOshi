param(
    [Parameter(Mandatory=$true)][string]$ArchivePath,
    [Parameter(Mandatory=$true)][string]$JobDir
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# This script belongs to the currently installed app. Never execute an extractor
# from the downloaded archive, and never extract before checking every entry.
$archive = $null
try {
    $job = [IO.Path]::GetFullPath($JobDir).TrimEnd([char]'\')
    $archiveFile = [IO.Path]::GetFullPath($ArchivePath)
    if (-not [IO.Directory]::Exists($job) -or
        $archiveFile -cne [IO.Path]::Combine($job, 'release.zip') -or
        (([IO.File]::GetAttributes($job) -band [IO.FileAttributes]::ReparsePoint) -ne 0) -or
        (([IO.File]::GetAttributes($archiveFile) -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { throw 'archive_unsafe' }
    $unpacked = [IO.Path]::Combine($job, 'unpacked')
    $app = [IO.Path]::Combine($job, 'app')
    if ([IO.Directory]::Exists($unpacked) -or [IO.File]::Exists($unpacked) -or
        [IO.Directory]::Exists($app) -or [IO.File]::Exists($app)) { throw 'archive_unsafe' }
    $archive = [IO.Compression.ZipFile]::OpenRead($archiveFile)
    if ($archive.Entries.Count -lt 1 -or $archive.Entries.Count -gt 10000) { throw 'archive_unsafe' }
    $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    $kinds = New-Object 'Collections.Generic.Dictionary[string,bool]' ([StringComparer]::OrdinalIgnoreCase)
    $plan = New-Object 'Collections.Generic.List[object]'
    $root = $null
    [long]$total = 0
    foreach ($entry in $archive.Entries) {
        $name = $entry.FullName
        if ([string]::IsNullOrEmpty($name) -or $name.Length -gt 1024 -or
            $name.Contains('\') -or $name.StartsWith('/') -or $name -match '[\x00-\x1f\x7f]' -or
            $name -match '^[A-Za-z]:' -or [IO.Path]::IsPathRooted($name)) { throw 'archive_unsafe' }
        $directory = $name.EndsWith('/')
        $normalized = if ($directory) { $name.Substring(0,$name.Length-1) } else { $name }
        $parts = $normalized.Split([char]'/')
        foreach ($part in $parts) {
            if ([string]::IsNullOrEmpty($part) -or $part -eq '.' -or $part -eq '..' -or
                $part.Length -gt 255 -or $part -match '[<>:"|?*]' -or $part -match '[. ]$' -or
                $part -match '^(?i:CON|CONIN\$|CONOUT\$|PRN|AUX|NUL|COM[1-9\u00b9\u00b2\u00b3]|LPT[1-9\u00b9\u00b2\u00b3])(?:\.|$)') { throw 'archive_unsafe' }
        }
        if ($null -eq $root) { $root = $parts[0] }
        if ($parts[0] -cne $root -or ($parts.Length -eq 1 -and -not $directory)) { throw 'archive_unsafe' }
        if (-not $seen.Add($normalized)) { throw 'archive_unsafe' }
        # Reject Unix symlinks and other special files, plus DOS reparse points.
        [long]$attributes = $entry.ExternalAttributes
        $unixType = ($attributes -shr 16) -band 0xf000
        if (($unixType -ne 0 -and $unixType -ne 0x8000 -and $unixType -ne 0x4000) -or
            ($attributes -band 0x400) -ne 0 -or ($unixType -eq 0x4000 -and -not $directory) -or
            ($directory -and $entry.Length -ne 0)) { throw 'archive_unsafe' }
        if ($entry.Length -lt 0 -or $entry.Length -gt 134217728) { throw 'archive_unsafe' }
        $total += $entry.Length
        if ($total -gt 536870912) { throw 'archive_unsafe' }
        # A file cannot also be an implicit parent directory of another entry.
        for ($i=1; $i -le $parts.Length; $i++) {
            $prefix = [string]::Join('/', $parts[0..($i-1)])
            $isDirectory = ($i -lt $parts.Length) -or $directory
            if ($kinds.ContainsKey($prefix)) {
                if ($kinds[$prefix] -ne $isDirectory) { throw 'archive_unsafe' }
            } else { $kinds.Add($prefix,$isDirectory) }
        }
        $destination = [IO.Path]::GetFullPath([IO.Path]::Combine($unpacked,$normalized.Replace('/','\')))
        if (-not $destination.StartsWith($unpacked + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'archive_unsafe' }
        $plan.Add([pscustomobject]@{ Entry=$entry; Destination=$destination; Directory=$directory })
    }
    [IO.Directory]::CreateDirectory($unpacked) | Out-Null
    $buffer = New-Object byte[] 65536
    foreach ($item in $plan) {
        if ($item.Directory) { [IO.Directory]::CreateDirectory($item.Destination) | Out-Null; continue }
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($item.Destination)) | Out-Null
        $inputStream = $null
        $outputStream = $null
        try {
            $inputStream = $item.Entry.Open()
            $outputStream = New-Object IO.FileStream($item.Destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
            [long]$written = 0
            while (($read = $inputStream.Read($buffer,0,$buffer.Length)) -gt 0) {
                $written += $read
                if ($written -gt $item.Entry.Length -or $written -gt 134217728) { throw 'archive_unsafe' }
                $outputStream.Write($buffer,0,$read)
            }
            if ($written -ne $item.Entry.Length) { throw 'archive_unsafe' }
        } finally {
            if ($null -ne $outputStream) { $outputStream.Dispose() }
            if ($null -ne $inputStream) { $inputStream.Dispose() }
        }
    }
    $archive.Dispose()
    $archive = $null
    [IO.Directory]::Move([IO.Path]::Combine($unpacked,$root),$app)
    [IO.Directory]::Delete($unpacked)
} catch {
    # Preserve no archive paths or remote data in the caller-visible diagnostic.
    [Console]::Error.WriteLine('archive_unsafe')
    exit 1
} finally {
    if ($null -ne $archive) { $archive.Dispose() }
}
