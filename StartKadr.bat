@echo off
rem Double-click this file to start Kadr. Your browser opens by itself.
rem Close this black window (or press Ctrl+C) to stop Kadr.
title Kadr
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo First start: installing Kadr. This takes a few minutes, only once...
    python -m venv .venv
    if errorlevel 1 (
        echo.
        echo Python was not found. Install it from https://www.python.org/downloads/
        echo and tick "Add python.exe to PATH" during the install. Then try again.
        pause
        exit /b 1
    )
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt
)

".venv\Scripts\python.exe" run.py
pause
