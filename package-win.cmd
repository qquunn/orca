@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

REM One-click Windows installer build. Output: dist\orca-windows-setup.exe
REM
REM Equivalent to the official `pnpm run build:win`, with this machine's environment
REM fixes baked in:
REM   1. Node 24  (repo engines require it; the system default node is v20)
REM   2. pnpm invoked through its JS entry (the pnpm shim on PATH is broken)
REM   3. NoDefaultCurrentDirectoryInExePath cleared for THIS process tree only, so
REM      VsDevCmd.bat -> vswhere.exe discovery works and node-gyp / rc.exe find the
REM      Visual Studio toolchain again.
REM   4. build:mobile-web needs mobile/ installed and its three generated .ts files.
REM      This machine's transparent encryption agent (%%TSD-Header%%) corrupts patched
REM      native sources (react-native-webview), so pnpm's patch step fails; the
REM      generated files are produced directly below instead of via postinstall.

REM (3) must happen before any child process spawns.
set "NoDefaultCurrentDirectoryInExePath="
REM Cold bun.exe --version can exceed the 2000 ms probe on this host (AV/encryption scans).
set "ORCA_BUN_PROBE_TIMEOUT_MS=15000"
REM Point node-gyp scratch builds at an encryption-agent-free temp root. The host's
REM transparent-encryption agent (%%TSD-Header%%) transparently encrypts the
REM node_modules\node-addon-api headers that node-gyp stages into its D:-drive scratch
REM dirs (os.tmpdir() reads %%TEMP%%=D:\temp, and the scratch lands on D:), which makes
REM MSBuild choke on "%TSD-Header%%" instead of real C++ text. C: (%%LOCALAPPDATA%%\Temp)
REM is exempt, so stage there instead.
set "TEMP=%LOCALAPPDATA%\Temp"
set "TMP=%LOCALAPPDATA%\Temp"
REM The encryption agent also encrypts the resource.rc cargo writes under the crate's
REM D:-drive target dir; move it to the exempt C: temp so rc.exe can compile it.
set "ORCA_CARGO_TARGET_DIR=%LOCALAPPDATA%\Temp\orca-cargo-target"

REM node-gyp must run inside a real "Developer Command Prompt" (rebuild-native-win.cmd
REM relies on the same trick). Call VsDevCmd once here and keep VCINSTALLDIR/VSCMD_VER
REM in the environment, so every node-gyp in build:win finds the VS toolchain and the
REM shared-store node-gyp (whose PowerShell discovery is corrupted by the encryption
REM agent) never needs to fall back to it.
call "D:\VSBuildTools\Common7\Tools\VsDevCmd.bat" -no_logo -arch=x64 -host_arch=x64
if errorlevel 1 (
    echo [package] VsDevCmd.bat failed to initialize the compiler environment.
    exit /b 1
)
echo [package] Compiler env: VSCMD_VER=%VSCMD_VER% VCINSTALLDIR=%VCINSTALLDIR%

set "NODE24="
for /d %%D in ("%USERPROFILE%\.cache\node24\node-v*-win-x64") do (
    if exist "%%D\node.exe" set "NODE24=%%D\node.exe"
)
if not defined NODE24 (
    echo [package] ERROR: Node 24 not found under %USERPROFILE%\.cache\node24
    exit /b 1
)
for %%F in ("%NODE24%") do set "NODE24_DIR=%%~dpF"
set "PATH=%NODE24_DIR%;%PATH%"

set "PNPM_JS=%USERPROFILE%\AppData\Local\pnpm\.tools\pnpm\12.14.0\node_modules\pnpm\bin\pnpm.mjs"
if not exist "%PNPM_JS%" (
    echo [package] ERROR: pnpm JS entry not found: %PNPM_JS%
    exit /b 1
)

echo [package] Node: %NODE24%
echo [package] Step 1/3: repairing install (restores pnpm.exe / bun.exe / native modules)
"%NODE24%" "%PNPM_JS%" install --frozen-lockfile
if errorlevel 1 (
    echo [package] install failed. If the error is node-gyp "find VS", run rebuild-native-win.cmd electron first, then re-run this script.
    exit /b 1
)

echo [package] Step 2/3: installing mobile workspace deps (build:mobile-web needs them)
"%NODE24%" "%PNPM_JS%" -C mobile install --frozen-lockfile
if not errorlevel 1 goto :mobile_installed
echo [package] WARNING: mobile install reported an error - see above.
echo [package] The local encryption agent %%TSD-Header%% corrupts patched sources such as
echo [package] react-native-webview, so pnpm's patch step fails. The deps are still linked;
echo [package] continuing by regenerating the generated files directly.
:mobile_installed

echo [package] Regenerating mobile generated artifacts (postinstall equivalent)
pushd "%~dp0mobile"
"%NODE24%" scripts\build-terminal-webview-engine.mjs
if errorlevel 1 goto :mobile_gen_failed
"%NODE24%" scripts\build-mermaid-page-engine.mjs
if errorlevel 1 goto :mobile_gen_failed
"%NODE24%" scripts\build-terminal-document-script.mjs
if errorlevel 1 goto :mobile_gen_failed
popd

echo [package] Step 3/3: building the Windows installer (pnpm run build:win)
"%NODE24%" "%PNPM_JS%" run build:win
if errorlevel 1 (
    echo [package] build:win failed with exit code %ERRORLEVEL%
    exit /b 1
)

echo.
echo [package] OK. Installer: dist\orca-windows-setup.exe
endlocal
exit /b 0

:mobile_gen_failed
popd
echo [package] mobile generated-artifact step failed.
exit /b 1
