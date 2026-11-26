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
