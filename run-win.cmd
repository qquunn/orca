@echo off
setlocal

REM One-click launch of the freshly built Orca dev app.
REM Loads out\main\index.js via node_modules\electron, in NODE_ENV=development so the
REM profile is isolated under %APPDATA%\orca-dev (never touches an installed Orca's data).

chcp 65001 >nul
cd /d "%~dp0"

if not exist "out\main\index.js" (
    echo [run] out\main\index.js not found. Run build-win.cmd first.
    exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
    echo [run] electron.exe not found at node_modules\electron\dist. Run pnpm install first.
    exit /b 1
)

echo [run] Starting Orca dev app ^(NODE_ENV=development, profile: %%APPDATA%%\orca-dev^)
echo [run] Close the window or press Ctrl+C here to quit.
set "NODE_ENV=development"
node_modules\electron\dist\electron.exe .

endlocal
