@echo off
title Personal Hub - AI Bridge
rem ===== 按你的实际情况修改下面三行 =====
set PHUB_PB_URL=http://127.0.0.1:8090
set PHUB_EMAIL=你的同步邮箱
set PHUB_PASS=你的同步密码
set PHUB_DEVICE=我的电脑
rem ====================================

echo ================================================
echo   Personal Hub AI Bridge starting...
echo   Device: %PHUB_DEVICE%
echo   PB:     %PHUB_PB_URL%
echo   KEEP THIS WINDOW OPEN
echo ================================================

node "%~dp0phub-bridge.mjs" --pb "%PHUB_PB_URL%" --email "%PHUB_EMAIL%" --pass "%PHUB_PASS%" --device "%PHUB_DEVICE%"

pause
