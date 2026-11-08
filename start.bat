@echo off
setlocal
cd /d "%~dp0"
set "PORT=8765"

where py >nul 2>nul
if %errorlevel%==0 (
    start "Borderlands Loot - local server" cmd /k "cd /d ""%~dp0"" && py -3 -m http.server %PORT% --bind 127.0.0.1"
) else (
    where python >nul 2>nul
    if errorlevel 1 (
        echo Python 3 was not found.
        echo Install Python 3 from https://www.python.org/downloads/
        echo During installation enable "Add Python to PATH".
        pause
        exit /b 1
    )
    start "Borderlands Loot - local server" cmd /k "cd /d ""%~dp0"" && python -m http.server %PORT% --bind 127.0.0.1"
)

timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%/"
echo.
echo Borderlands Loot is running at http://127.0.0.1:%PORT%/
echo To stop it, close the server command window.
exit /b 0
