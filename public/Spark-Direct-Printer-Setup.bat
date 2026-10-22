@echo off
title WinTech-Spark POSIFLOW PSF-20 Direct Print Bridge Setup
echo ================================================================
echo   WinTech-Spark POSIFLOW PSF-20 (SR20) Direct Print Setup
echo ================================================================
echo.
set "INSTALL_DIR=%APPDATA%\WinTechSpark"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo [1/3] Installing Local Windows Direct Print Service (Port 18181)...
if exist "%~dp0spark-print-bridge.ps1" (
  copy /Y "%~dp0spark-print-bridge.ps1" "%INSTALL_DIR%\spark-print-bridge.ps1" >nul
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://spark-winauto.vercel.app/spark-print-bridge.ps1' -OutFile '%INSTALL_DIR%\spark-print-bridge.ps1' -UseBasicParsing"
)

echo [2/3] Configuring Windows Startup Auto-Launch...
(
  echo Set WshShell = CreateObject^("WScript.Shell"^)
  echo WshShell.Run "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File ""%INSTALL_DIR%\spark-print-bridge.ps1""", 0, False
) > "%STARTUP_DIR%\Spark-Thermal-Print-Bridge.vbs"

echo [3/3] Starting Direct Print Service and Calibrating SR20 Roll Size...
wscript.exe "%STARTUP_DIR%\Spark-Thermal-Print-Bridge.vbs"
timeout /t 2 /nobreak >nul

echo.
echo ================================================================
echo   SUCCESS! Direct Thermal Printing is now ACTIVE on this PC!
echo   You can now print directly from https://spark-winauto.vercel.app
echo   without any Windows print dialog or page splitting.
echo ================================================================
pause
