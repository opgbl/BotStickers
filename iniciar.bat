@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js 20 o más nuevo. Descárgalo de https://nodejs.org
  pause
  exit /b 1
)
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo Falta ffmpeg. Instálalo con: winget install Gyan.FFmpeg
  echo Después cierra esta ventana y abre iniciar.bat otra vez.
  pause
  exit /b 1
)

where yt-dlp >nul 2>nul
if errorlevel 1 echo Opcional: para hacer stickers desde links instala yt-dlp con: winget install yt-dlp.yt-dlp

node -e "process.exit(+process.versions.node.split('.')[0]<20?1:0)"
if errorlevel 1 (
  echo Se necesita Node.js 20 o más nuevo. Descárgalo de https://nodejs.org
  pause
  exit /b 1
)

if defined BOT_NO_UPDATE_CHECK goto skipupdate
if not exist ".git" goto skipupdate
where git >nul 2>nul
if errorlevel 1 goto skipupdate
echo Buscando actualizaciones...
git fetch -q origin <nul >nul 2>nul
if errorlevel 1 (
  echo No se pudo revisar si hay actualizaciones.
  goto skipupdate
)
set "BEHIND="
for /f %%n in ('git rev-list --count HEAD..@{u} 2^>nul') do set "BEHIND=%%n"
if not defined BEHIND goto skipupdate
if "%BEHIND%"=="0" (
  echo El bot está actualizado.
  goto skipupdate
)
echo.
echo Hay una actualización del bot (%BEHIND% cambios):
git --no-pager log --format="  - %%s" -n 10 HEAD..@{u} <nul
set "TRIES=0"
:askupdate
set /a TRIES+=1
if %TRIES% GTR 5 (
  echo No se actualizó.
  goto skipupdate
)
set "ANSWER="
set /p "ANSWER=¿Quieres actualizar ahora? Escribe si o no y presiona Enter: "
if not defined ANSWER goto askupdate
if /i "%ANSWER:~0,1%"=="n" (
  echo No se actualizó. Te lo vuelvo a preguntar la próxima vez que inicies el bot.
  goto skipupdate
)
if /i not "%ANSWER:~0,1%"=="s" (
  echo Escribe si o no.
  goto askupdate
)
for /f %%h in ('git rev-parse HEAD') do set "OLDHEAD=%%h"
(
  git pull --ff-only -q
  if errorlevel 1 (
    echo No se pudo actualizar. Si cambiaste archivos del bot, guarda una copia y bórralos, o vuelve a descargarlo.
    goto skipupdate
  )
  git diff --quiet %OLDHEAD% HEAD -- package.json package-lock.json || call npm install --omit=dev --no-audit --no-fund
  echo Bot actualizado.
  set "BOT_NO_UPDATE_CHECK=1"
  call "%~f0"
  exit /b
)
:skipupdate

node -e "const d=Object.keys(require('./package.json').dependencies||{});process.exit(d.some(x=>!require('fs').existsSync('node_modules/'+x+'/package.json'))?1:0)"
if errorlevel 1 (
  echo Instalando dependencias...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias. Revisa tu internet.
    pause
    exit /b 1
  )
)

:loop
node index.js
echo El bot se cerró. Reiniciando en 5 s. Cierra la ventana para salir.
timeout /t 5 /nobreak >nul
goto loop
