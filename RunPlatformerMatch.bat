@echo off
cd /d "%~dp0"
python "platformer/arena/train.py" --players deepseek-flash sol --rounds 3 --port 8816 --no-isolation
pause
