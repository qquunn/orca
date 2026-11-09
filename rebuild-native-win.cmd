@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

REM One-click Windows native-module rebuild for Orca.
REM
REM Root causes on this machine (all fixed here WITHOUT touching persistent machine/user settings):
REM   1. NoDefaultCurrentDirectoryInExePath=1  -> clears it for this process tree.
REM   2. node-gyp's own PowerShell discovery fails: its Find-VisualStudio.cs is corrupted
REM      (a "%%TSD-Header-###%%" blob instead of C# source), so every discovery path that
REM      does not already have VCINSTALLDIR/VSCMD_VER set ends in "Could not find any Visual
REM      Studio installation to use".
REM
REM Fix: run node-gyp from inside a real "Developer Command Prompt" environment. We call
REM VsDevCmd.bat ourselves (with the hardening var cleared so it finds vswhere.exe), which
REM sets VCINSTALLDIR + VSCMD_VER; node-gyp then uses `findVSFromSpecifiedLocation` and never
REM touches the corrupted PowerShell discovery. This is exactly how Orca's own
REM initializeWindowsNativeToolchain intends to work.

set "NoDefaultCurrentDirectoryInExePath="

set "NODE24="
for /d %%D in ("%USERPROFILE%\.cache\node24\node-v*-win-x64") do (
    if exist "%%D\node.exe" set "NODE24=%%D\node.exe"
)
if not defined NODE24 (
    echo [rebuild] ERROR: Node 24 not found under %USERPROFILE%\.cache\node24
    exit /b 1
)
for %%F in ("%NODE24%") do set "NODE24_DIR=%%~dpF"
set "PATH=%NODE24_DIR%;%PATH%"

set "MODE=node"
if /i "%~1"=="electron" set "MODE=electron"

echo [rebuild] Node: %NODE24%
echo [rebuild] Target runtime: %MODE%

call "D:\VSBuildTools\Common7\Tools\VsDevCmd.bat" -no_logo -arch=x64 -host_arch=x64
if errorlevel 1 (
    echo [rebuild] VsDevCmd.bat failed to initialize the compiler environment.
    exit /b 1
)
echo [rebuild] Compiler env: VSCMD_VER=%VSCMD_VER% VCINSTALLDIR=%VCINSTALLDIR% SDK=%WindowsSDKVersion%

"%NODE24%" "config\scripts\ensure-native-runtime.mjs" --runtime=%MODE%
set "EXIT=%ERRORLEVEL%"

if not "%EXIT%"=="0" (
    echo [rebuild] FAILED with exit code %EXIT%
    echo [rebuild] See the node-gyp errors above.
    exit /b %EXIT%
)
echo [rebuild] OK. Native modules load for %MODE% runtime.
endlocal
exit /b 0
