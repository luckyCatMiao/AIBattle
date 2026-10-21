@echo off
cd /d "%~dp0"
node hero-rts\launch.js
if errorlevel 1 pause
