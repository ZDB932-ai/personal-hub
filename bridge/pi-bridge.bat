@echo off
chcp 65001 >nul
title Personal Hub - pi Native TUI Bridge
set "PI_PROJECT=E:\Chat with Pi"
if "%PHUB_TUI_TOKEN%"=="" (
  set /p "PHUB_TUI_TOKEN=请输入至少 32 位的随机 Bridge Token: "
)
if "%PHUB_TUI_TOKEN%"=="" (
  echo 未设置 Bridge Token，已取消启动。
  pause
  exit /b 1
)

echo ================================================
echo   Personal Hub - pi Native TUI Bridge
echo   Project: %PI_PROJECT%
echo   HTTP:    0.0.0.0:8811
echo   Hub and this TUI control the same pi process.
echo ================================================
echo.

pushd "%PI_PROJECT%"
call pi -c -e "%~dp0phub-pi-tui-bridge.ts" --phub-tui-port "8811" --phub-tui-token "%PHUB_TUI_TOKEN%" --phub-tui-project-id "31c7671d-8a92-48d0-b0a5-2b47045300f3" --phub-tui-project-name "Chat with Pi" --phub-tui-device "我的电脑"
popd

echo.
echo pi exited. Press any key to close.
pause >nul
