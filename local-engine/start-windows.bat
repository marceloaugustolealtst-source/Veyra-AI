@echo off
cd /d "%~dp0"
if not exist .venv (
  py -3.10 -m venv .venv
)
call .venv\Scripts\activate
python -m pip install --upgrade pip
python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
python -m pip install -r requirements.txt
python server.py
pause
