@echo off
title Construction App - Dev Server

echo ================================
echo  Construction Management App
echo  Dev Server Startup
echo ================================
echo.

:: Kill any existing process on port 5173
echo [1/2] Stopping any existing server on port 5173...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5173 "') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Short pause to release port
timeout /t 1 /nobreak >nul

echo [2/2] Starting dev server...
echo.
echo  Local:    http://localhost:5173
echo  Network:  Check output below for Network IP
echo.
echo  Press Ctrl+C to stop the server
echo ================================
echo.

cd /d "%~dp0"
npm run dev
