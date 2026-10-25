@echo off
cd /d "%~dp0"
python "badminton/arena/train.py" --players deepseek-flash sol --rounds 3 --port 8810 --no-isolation
pause
