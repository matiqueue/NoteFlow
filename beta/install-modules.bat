@echo off
setlocal enabledelayedexpansion

for /f "delims=" %%i in (requirements.txt) do (
  npm install %%i
)

endlocal
