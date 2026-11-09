@echo off
setlocal

REM One-click local build for Orca on this Windows machine.
REM Baked-in workarounds:
REM   1. Uses the Node 24 install under %USERPROFILE%\.cache\node24 (repo engines require
REM      Node 24; the system default node is v20, which crashes the vitest/electron-vite
REM      config loader with "globSync is not a function").
REM   2. Invokes the electron-vite build runner directly instead of `pnpm run build:electron-vite`,
REM      because that path triggers pnpm's pre-run install + node-gyp native rebuild, which is
REM      broken on this machine (see NOTE at the end).

chcp 65001 >nul
cd /d "%~dp0"

set "NODE24="
for /d %%D in ("%USERPROFILE%\.cache\node24\node-v*-win-x64") do (
    if exist "%%D\node.exe" set "NODE24=%%D\node.exe"
)
if not defined NODE24 (
    echo [build] ERROR: Node 24 not found under %USERPROFILE%\.cache\node24
    echo [build] Expected a folder like node-v24.x.x-win-x64 containing node.exe.
    exit /b 1
)

for %%F in ("%NODE24%") do set "NODE24_DIR=%%~dpF"
set "PATH=%NODE24_DIR%;%PATH%"

set "E2E_ARGS="
if /i "%~1"=="e2e" set "E2E_ARGS=--mode e2e"
if /i "%~1"=="e2e" set "VITE_EXPOSE_STORE=true"

echo [build] Node: %NODE24%
"%NODE24%" --version

echo [build] Building Electron app (main + preload + renderer) %E2E_ARGS%
"%NODE24%" config\scripts\run-electron-vite-build.mjs %E2E_ARGS%
set "EXIT=%ERRORLEVEL%"
if not "%EXIT%"=="0" (
    echo [build] FAILED with exit code %EXIT%
    exit /b %EXIT%
)

echo.
echo [build] OK. Fresh output:
echo   out\main\index.js
echo   out\preload\index.js
echo   out\renderer\index.html
endlocal
exit /b 0
