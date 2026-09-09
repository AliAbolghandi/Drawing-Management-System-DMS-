@echo off
netsh advfirewall firewall add rule name="DMS LAN HTTP 80" dir=in action=allow protocol=TCP localport=80
if %errorlevel%==0 (
  echo.
  echo Firewall rule created successfully.
) else (
  echo.
  echo Failed. Right-click this file and choose "Run as administrator".
)
pause
