@echo off
chcp 65001 >nul
title Personal Hub - pi Synced Console
set BRIDGE_URL=http://127.0.0.1:8811
if "%HTTP_TOKEN%"=="" (
  set /p "HTTP_TOKEN=请输入启动 bridge 时使用的 Token: "
)
if "%HTTP_TOKEN%"=="" (
  echo 未设置 Bridge Token，已取消启动。
  pause
  exit /b 1
)
node "%~dp0pi-console.mjs" --url "%BRIDGE_URL%" --token "%HTTP_TOKEN%"
echo.
echo Console exited. Press any key to close.
pause >nul
