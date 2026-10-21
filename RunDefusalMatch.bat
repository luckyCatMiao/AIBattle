@echo off
cd /d "%~dp0"
python "defusal\arena\train.py" --players deepseek-flash sol --rounds 3 --port 8799
pause
