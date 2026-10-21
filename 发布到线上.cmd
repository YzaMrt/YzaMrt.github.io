@echo off
title Publish Blog
echo Checking for changes and publishing to GitHub...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\publish.ps1"
if errorlevel 1 (
    echo.
    echo Publish failed. Please read the message above.
) else (
    echo.
    echo Finished. The site will update in about a minute.
)
echo.
echo Press any key to close this window...
pause >nul
