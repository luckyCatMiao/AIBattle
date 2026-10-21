@echo off
cd /d "%~dp0"
node "fighting/launch.js"
if errorlevel 1 pause
