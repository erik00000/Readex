@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where pnpm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] pnpm was not found.
  echo Install Node.js and pnpm before running this script.
  exit /b 1
)

for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content -Raw 'package.json' | ConvertFrom-Json).version"`) do set "APP_VERSION=%%V"
if not defined APP_VERSION (
  echo [ERROR] Could not read the version from package.json.
  exit /b 1
)

echo.
echo ============================================================
echo  Readex share ZIP builder - version %APP_VERSION%
echo ============================================================
echo.

echo [1/4] Installing locked dependencies...
call pnpm install --frozen-lockfile
if errorlevel 1 goto :failed

echo.
echo [2/4] Building the production application...
call pnpm build
if errorlevel 1 goto :failed

echo.
echo [3/4] Creating the Windows application bundle...
call pnpm exec electron-builder --win zip
if errorlevel 1 goto :failed

echo.
echo [4/4] Assembling the lightweight share ZIP...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $root=(Resolve-Path '.').Path; $source=Join-Path $root 'release\win-unpacked'; $work=Join-Path $root 'release\share-package'; $app=Join-Path $work ('Readex-' + '%APP_VERSION%' + '-green'); $zip=Join-Path $root ('release\Readex-' + '%APP_VERSION%' + '-green-share.zip'); if(-not (Test-Path -LiteralPath (Join-Path $source 'Readex.exe'))){throw 'release\win-unpacked\Readex.exe was not found'}; New-Item -ItemType Directory -Force -Path $work | Out-Null; $workRoot=[System.IO.Path]::GetFullPath($work) + [System.IO.Path]::DirectorySeparatorChar; $appPath=[System.IO.Path]::GetFullPath($app); if(-not $appPath.StartsWith($workRoot,[System.StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe staging path'}; if(Test-Path -LiteralPath $appPath){Remove-Item -LiteralPath $appPath -Recurse -Force}; New-Item -ItemType Directory -Force -Path $appPath | Out-Null; Get-ChildItem -LiteralPath $source -Force | Where-Object { $_.Name -notin @('locales','data') } | Copy-Item -Destination $appPath -Recurse -Force; $localeSource=Join-Path $source 'locales'; $localeTarget=Join-Path $appPath 'locales'; New-Item -ItemType Directory -Force -Path $localeTarget | Out-Null; foreach($locale in @('zh-CN.pak','zh-TW.pak','en-US.pak')){ $file=Join-Path $localeSource $locale; if(-not (Test-Path -LiteralPath $file)){throw ('Missing locale: ' + $locale)}; Copy-Item -LiteralPath $file -Destination $localeTarget -Force }; Get-ChildItem -LiteralPath (Join-Path $root 'packaging') -Filter '*.txt' -File | Copy-Item -Destination $appPath -Force; if(Test-Path -LiteralPath $zip){Remove-Item -LiteralPath $zip -Force}; Compress-Archive -LiteralPath $appPath -DestinationPath $zip -CompressionLevel Optimal -Force; $sha=[System.Security.Cryptography.SHA256]::Create(); $stream=[System.IO.File]::OpenRead($zip); try { $hash=([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','') } finally { $stream.Dispose(); $sha.Dispose() }; $size=[math]::Round((Get-Item -LiteralPath $zip).Length / 1MB,2); Write-Host ''; Write-Host '[OK] Share ZIP created' -ForegroundColor Green; Write-Host ('Path: ' + $zip); Write-Host ('Size: ' + $size + ' MB'); Write-Host ('SHA256: ' + $hash)"
if errorlevel 1 goto :failed

echo.
echo Done. Send the ZIP above to your friend.
exit /b 0

:failed
echo.
echo [ERROR] Share ZIP build failed. Review the output above.
exit /b 1
