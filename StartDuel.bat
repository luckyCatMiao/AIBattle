@echo off
cd /d "%~dp0"
node "duel/launch.js"
if errorlevel 1 pause
