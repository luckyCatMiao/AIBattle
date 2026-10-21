@echo off
cd /d "%~dp0"
node launcher.js
if errorlevel 1 pause
