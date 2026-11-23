param([string]$RarPath)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = $package.version
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot "release\v$version"))
$source = Join-Path $releaseRoot 'win-unpacked'
if (-not (Test-Path -LiteralPath (Join-Path $source 'Readex.exe'))) { throw 'Build the setup package first: pnpm dist:setup' }
foreach ($privateDirectory in @('data', 'runtime')) {
    if (Test-Path -LiteralPath (Join-Path $source $privateDirectory)) { throw "Personal data found in build: $privateDirectory" }
}
if (-not $RarPath) {
    $rarCommand = Get-Command rar.exe -ErrorAction SilentlyContinue
    if ($rarCommand) { $RarPath = $rarCommand.Source }
    else {
        foreach ($candidate in @('C:\Program Files\WinRAR\Rar.exe', 'C:\Program Files (x86)\WinRAR\Rar.exe')) {
            if (Test-Path -LiteralPath $candidate) { $RarPath = $candidate; break }
        }
    }
}
if (-not $RarPath -or -not (Test-Path -LiteralPath $RarPath)) { throw 'RAR creation requires WinRAR/Rar.exe. Pass -RarPath if installed elsewhere.' }
$stageRoot = Join-Path $releaseRoot 'rar-stage'
$folderName = "Readex-$version"
$stage = [IO.Path]::GetFullPath((Join-Path $stageRoot $folderName))
$expectedPrefix = [IO.Path]::GetFullPath($stageRoot).TrimEnd('\') + '\'
if (-not $stage.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path' }
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Get-ChildItem -LiteralPath $source -Force | Where-Object { $_.Name -notin @('debug.log', 'data', 'runtime') } | Copy-Item -Destination $stage -Recurse -Force
$archive = Join-Path $releaseRoot "Readex-$version-Portable-x64.rar"
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
Push-Location -LiteralPath $stageRoot
try {
    & $RarPath a -ma5 -m5 -r -idq -y $archive $folderName
    if ($LASTEXITCODE -ne 0) { throw "RAR creation failed: $LASTEXITCODE" }
    & $RarPath t -idq $archive
    if ($LASTEXITCODE -ne 0) { throw "RAR integrity check failed: $LASTEXITCODE" }
} finally { Pop-Location }
$stream = [IO.File]::OpenRead($archive)
try {
    $header = New-Object byte[] 8
    [void]$stream.Read($header, 0, 8)
    if ([BitConverter]::ToString($header) -ne '52-61-72-21-1A-07-01-00') { throw 'The output is not a RAR5 archive' }
} finally { $stream.Dispose() }
Get-Item -LiteralPath $archive | Select-Object FullName,Length
Get-FileHash -LiteralPath $archive -Algorithm SHA256
