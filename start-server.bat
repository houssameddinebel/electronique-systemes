@echo off
REM Lance le site + backend Assistant IA (http://127.0.0.1:8000/)
cd /d "%~dp0"
start "" http://127.0.0.1:8000/
python backend\server.py
pause
