@echo off
title Personal Hub - opencode serve
if "%OPENCODE_SERVER_PASSWORD%"=="" (
  set /p "OPENCODE_SERVER_PASSWORD=请输入至少 16 位的随机服务密码: "
)
if "%OPENCODE_SERVER_PASSWORD%"=="" (
  echo 未设置服务密码，已取消启动。
  pause
  exit /b 1
)

echo ================================================
echo   opencode server is starting...
echo   KEEP THIS WINDOW OPEN
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
echo   URL: %%a:4096
)
echo   Authentication: enabled
echo.
echo   Hub: AI Workbench - Connection Settings
echo ================================================
echo.

opencode serve --hostname 0.0.0.0 --port 4096 --cors http://localhost --cors https://localhost

pause
