@echo off
title Construction App - Production + Tunnel

echo ================================
echo  Construction Management App
echo  Production Build + Cloudflare Tunnel
echo ================================
echo.

:: Build production bundle
echo [1/4] Building production bundle...
cd /d "%~dp0"
call npm run build
if errorlevel 1 (
    echo ERROR: Build failed. Check errors above.
    pause
    exit /b 1
)

:: Locate cloudflared
set CLOUDFLARED=
if exist "%USERPROFILE%\cloudflared-windows-amd64.exe" set CLOUDFLARED=%USERPROFILE%\cloudflared-windows-amd64.exe
if exist "%USERPROFILE%\Desktop\cloudflared-windows-amd64.exe" set CLOUDFLARED=%USERPROFILE%\Desktop\cloudflared-windows-amd64.exe
if exist "C:\cloudflared\cloudflared-windows-amd64.exe" set CLOUDFLARED=C:\cloudflared\cloudflared-windows-amd64.exe

if "%CLOUDFLARED%"=="" (
    echo ERROR: cloudflared-windows-amd64.exe not found.
    echo Please place it in: %USERPROFILE%\
    pause
    exit /b 1
)

:: Kill any leftover vite preview processes from previous runs
echo [2/3] Stopping any previous vite preview...
powershell -NoProfile -Command "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*vite*preview*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul

:: Start vite preview in a visible window (port 5173 should now be free)
echo [3/4] Starting vite preview server...
start "Vite Preview Server" cmd /k "cd /d "%~dp0" && npx vite preview --host 0.0.0.0"

:: Start tunnel (PS script probes TCP to find actual port)
echo [4/4] Starting Cloudflare tunnel...
echo.
echo =========================================================
echo  Vite port will be detected automatically.
echo  Tunnel URL will be opened once DNS is confirmed reachable.
echo  (URL changes every restart)
echo =========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-tunnel.ps1" -CloudflaredPath "%CLOUDFLARED%"

pause
