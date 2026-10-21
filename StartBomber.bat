@echo off
cd /d "%~dp0"
node "bomber/launch.js"
if errorlevel 1 pause
