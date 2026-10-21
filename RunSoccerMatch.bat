@echo off
cd /d "%~dp0"
python "soccer/arena/train.py" --players deepseek-flash sol --rounds 3 --port 8803
pause
