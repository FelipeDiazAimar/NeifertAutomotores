@echo off
REM Neifert Automotores - menu para pruebas locales (web y/o servidor de WhatsApp)
chcp 65001 >nul
title Neifert - Pruebas locales
cd /d "%~dp0"

:menu
cls
echo.
echo   ==================================================
echo     Neifert Automotores  -  Pruebas locales
echo   ==================================================
echo.
echo     1. Solo la web                 (npm run dev)
echo     2. Solo el servidor de WhatsApp (app de escritorio, npm start)
echo     3. Web + servidor de WhatsApp
echo     4. Salir
echo.
choice /c 1234 /n /m "   Elegi una opcion [1-4]: "
if errorlevel 4 exit /b 0
if errorlevel 3 goto ambos
if errorlevel 2 goto servidor
goto web

:web
call :lanzar_web
goto menu

:servidor
call :lanzar_servidor
goto menu

:ambos
call :lanzar_web
call :lanzar_servidor
goto menu

:lanzar_web
echo.
echo   Abriendo la web (http://localhost:5173)... dejá la ventana abierta.
start "Neifert - web" cmd /k "cd /d ""%~dp0"" && npm run dev"
exit /b 0

:lanzar_servidor
if not exist "%~dp0Whatsapp\escritorio\node_modules" (
    echo.
    echo   Falta instalar la app de escritorio: corriendo npm install...
    pushd "%~dp0Whatsapp\escritorio" && call npm install && popd
)
echo.
echo   Abriendo el servidor de WhatsApp (app de escritorio)... dejá la ventana abierta.
start "Neifert - servidor WhatsApp" cmd /k "cd /d ""%~dp0Whatsapp\escritorio"" && npm start"
exit /b 0
