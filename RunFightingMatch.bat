@echo off
cd /d "%~dp0"
python "fighting/arena/train.py" --players opus sol --rounds 3 --prepare-seconds 1800 --port 8796
pause
