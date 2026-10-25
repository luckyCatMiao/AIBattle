@echo off
setlocal
set "HERE=%~dp0"
if exist "%HERE%python3.exe" (
  "%HERE%python3.exe" "%HERE%agent.py"
  exit /b %errorlevel%
)
where python3 >nul 2>nul
if not errorlevel 1 (
  python3 "%HERE%agent.py"
  exit /b %errorlevel%
)
python "%HERE%agent.py"
