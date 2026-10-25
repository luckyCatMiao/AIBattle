@echo off
cd /d "%~dp0"
python "racing/arena/train.py" --players deepseek-flash sol --rounds 3 --port 8807 --no-isolation
pause
