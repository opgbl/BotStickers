#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")" || exit 1

IS_TERMUX=0
[ -n "$PREFIX" ] && [ "${PREFIX#*com.termux}" != "$PREFIX" ] && IS_TERMUX=1

HERE=$(pwd -P)
if [ "$IS_TERMUX" = 1 ] && case "$HERE" in /storage/*|/sdcard/*|/mnt/*) true;; *) false;; esac; then
  DEST="$HOME/$(basename "$HERE")"
  if [ -e "$DEST" ]; then
    echo "Ya existe $DEST. Usa: cd $DEST && bash start.sh"
    exit 1
  fi
  mkdir -p "$DEST" && cp -r . "$DEST"/ && rm -rf "$DEST/node_modules" || { echo "No se pudo mover la carpeta."; exit 1; }
  echo "La carpeta se movió a $DEST"
  exec bash "$DEST/start.sh"
fi

if [ "$IS_TERMUX" = 1 ]; then
  NEED=""
  command -v node >/dev/null || NEED="$NEED nodejs-lts"
  command -v ffmpeg >/dev/null || NEED="$NEED ffmpeg"
  [ -f "$PREFIX/share/fonts/TTF/DejaVuSans-Bold.ttf" ] || NEED="$NEED ttf-dejavu"
  if [ -n "$NEED" ]; then
    echo "Instalando$NEED"
    pkg update -y && pkg install -y $NEED || { echo "No se pudo instalar:$NEED"; exit 1; }
  fi
else
  command -v node >/dev/null || { echo "Falta Node.js 20 o más nuevo."; exit 1; }
  command -v ffmpeg >/dev/null || { echo "Falta ffmpeg."; exit 1; }
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Se necesita Node.js 20 o más nuevo."
  [ "$IS_TERMUX" = 1 ] && echo "Usa: pkg upgrade -y nodejs-lts"
  exit 1
fi

if ! ffmpeg -hide_banner -encoders 2>/dev/null | grep -q libwebp; then
  echo "ffmpeg no tiene libwebp, los stickers no van a funcionar."
fi

if ! command -v yt-dlp >/dev/null && [ ! -x bin/yt-dlp ] && [ -z "$YTDLP_PATH" ]; then
  if [ "$IS_TERMUX" = 1 ]; then
    echo "Opcional: para hacer stickers desde links (#s <link>) instala yt-dlp: pkg install -y yt-dlp"
  else
    echo "Opcional: para hacer stickers desde links (#s <link>) instala yt-dlp."
  fi
fi

MISSING=$(node -e '
  const deps = Object.keys(require("./package.json").dependencies || {});
  const fs = require("fs");
  console.log(deps.filter((d) => !fs.existsSync(`node_modules/${d}/package.json`)).join(" "));
')
if [ -n "$MISSING" ]; then
  echo "Instalando dependencias..."
  npm install --omit=dev --no-audit --no-fund || { echo "No se pudieron instalar las dependencias. Revisa tu internet."; exit 1; }
fi

command -v termux-wake-lock >/dev/null && termux-wake-lock

export FFMPEG_MAX_CONCURRENT="${FFMPEG_MAX_CONCURRENT:-1}"

[ -t 1 ] && { clear 2>/dev/null || printf '\033c'; }

while true; do
  node index.js
  echo "El bot se cerró. Reiniciando en 5 s (Ctrl+C para salir)."
  sleep 5
done
