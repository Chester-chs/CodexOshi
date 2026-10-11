param([switch]$SkipNodeDownload)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$version=(Get-Content -LiteralPath (Join-Path $SourceRoot 'package.json') -Raw -Encoding UTF8|ConvertFrom-Json).version
$dist=Join-Path $SourceRoot 'dist'
$stage=Join-Path $dist 'installer-stage'
$payload=Join-Path $dist 'CodexOshi-Payload.zip'
$exe=Join-Path $dist ('CodexOshi-Setup-'+$version+'-win-x64.exe')
$nodeZip=Join-Path $dist 'node-v24.19.0-win-x64.zip'
$expected='57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73'
[IO.Directory]::CreateDirectory($dist)|Out-Null
if(-not(Test-Path -LiteralPath $nodeZip)){
    if($SkipNodeDownload){throw 'Node archive not cached.'}
    Invoke-WebRequest -Uri 'https://nodejs.org/dist/v24.19.0/node-v24.19.0-win-x64.zip' -OutFile $nodeZip -UseBasicParsing
}
if((Get-FileHash -LiteralPath $nodeZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'Official Node archive checksum mismatch.'}
if(Test-Path -LiteralPath $stage){Remove-Item -LiteralPath (Assert-CodiChildPath $stage $dist) -Recurse -Force}
[IO.Directory]::CreateDirectory((Join-Path $stage 'app'))|Out-Null
$archive=Join-Path $dist 'CodexOshi-Source.zip'
& git -C $SourceRoot archive --format=zip --output=$archive HEAD
if($LASTEXITCODE){throw 'Git source archive failed.'}
[IO.Compression.ZipFile]::ExtractToDirectory($archive,(Join-Path $stage 'app'))
Copy-Item -LiteralPath $nodeZip -Destination $stage
if(Test-Path -LiteralPath $payload){Remove-Item -LiteralPath $payload -Force}
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$payload,[IO.Compression.CompressionLevel]::Optimal,$false)
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:exe /platform:x64 /optimize+ /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /reference:System.Windows.Forms.dll "/resource:$payload,CodexOshi.Payload" "/out:$exe" (Join-Path $SourceRoot 'packaging\Installer.cs')
if($LASTEXITCODE){throw 'Installer compilation failed.'}
$hash=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $dist 'SHA256SUMS.txt'),($hash+'  '+(Split-Path -Leaf $exe)+"`n"),$Utf8)
Write-Output ([pscustomobject]@{installer=$exe;bytes=(Get-Item -LiteralPath $exe).Length;sha256=$hash;version=$version}|ConvertTo-Json)
