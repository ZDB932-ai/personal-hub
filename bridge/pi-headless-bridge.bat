@echo off
title Personal Hub - pi Headless Bridge
if "%HTTP_TOKEN%"=="" (
  set /p "HTTP_TOKEN=请输入至少 32 位的随机 Bridge Token: "
)
if "%HTTP_TOKEN%"=="" (
  echo 未设置 Bridge Token，已取消启动。
  pause
  exit /b 1
)
set PB_URL=
set PB_EMAIL=
set PB_PASS=
set PB_ARGS=
if defined PB_URL if defined PB_EMAIL if defined PB_PASS set PB_ARGS=--pb %PB_URL% --email %PB_EMAIL% --pass %PB_PASS%
node "%~dp0phub-bridge.mjs" --agent pi --http 8811 --http-token "%HTTP_TOKEN%" %PB_ARGS%
pause
