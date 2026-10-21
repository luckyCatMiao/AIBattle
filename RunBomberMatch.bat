@echo off
cd /d "%~dp0"
python "bomber/arena/train.py" --players deepseek-flash sol --rounds 3 --port 8797
pause
