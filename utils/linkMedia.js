'use strict';

// Descarga el video/imagen de un link (TikTok, Instagram, YouTube, X, Facebook…)
// con yt-dlp y calcula el recorte para que el sticker quede centrado.

const { execFile } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');
const { filepathTemp } = require('./common');
const { resolveFfmpegPath } = require('./ffmpegBin');
const { detectCenterBand } = require('./videoParts');

const URL_RE = /https?:\/\/[^\s<>"“”]+/i;
const MAX_DOWNLOAD = '30M';
const DOWNLOAD_TIMEOUT_MS = 90 * 1000;
const CROPDETECT_TIMEOUT_MS = 30 * 1000;
const BORDER_MIN_PX = 8; // menos que esto no cuenta como borde
const TOP_BIAS = 0.2; // 0 = pegado arriba, 0.5 = centro exacto
const IMAGE_EXTS =new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']);

/** Ruta de yt-dlp: YTDLP_PATH, bin/yt-dlp del proyecto o el del sistema. */
function ytDlpPath() {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  const local = path.join(__dirname, '..', 'bin', 'yt-dlp');
  return existsSync(local) ? local : 'yt-dlp';
}

/** Primer link http(s) del texto, o null. */
function findLink(text) {
  const m = String(text || '').match(URL_RE);
  return m ? m[0] : null;
}

/**
 * Quita el link y la palabra "completo" del mensaje.
 * @returns {{ body: string, full: boolean }} body limpio (sigue empezando por el comando) y si pidió el video completo
 */
function parseLinkBody(text) {
  const noLink = String(text || '').replace(URL_RE, ' ');
  const full = /(^|\s)completo(\s|$)/i.test(noLink);
  const body = noLink.replace(/(^|\s)completo(?=\s|$)/gi, ' ').replace(/\s+/g, ' ').trim();
  return { body, full };
}

function run(bin, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = String(stderr || '');
        return reject(err);
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

function downloadError(err) {
  const msg = `${err.stderr || ''} ${err.message || ''}`.toLowerCase();
  const e = new Error(`yt-dlp: ${(err.stderr || err.message || '').trim().slice(-300)}`);
  if (err.code === 'ENOENT') e.userMsg = 'Falta yt-dlp en el servidor, no puedo bajar links todavía.';
  else if (err.killed) e.userMsg = 'El link tardó demasiado en bajar. Prueba con otro.';
  else if (msg.includes('max-filesize') || msg.includes('larger than max')) e.userMsg = 'Ese video pesa demasiado para un sticker.';
  else if (msg.includes('private') || msg.includes('login') || msg.includes('cookies')) e.userMsg = 'Ese video es privado o pide iniciar sesión.';
  else if (msg.includes('unsupported url')) e.userMsg = 'No reconozco ese link. Prueba con TikTok, Instagram, YouTube, X o Facebook.';
  else e.userMsg = 'No pude bajar ese link. Revisa que sea público y prueba otra vez.';
  return e;
}

/**
 * Descarga el link a un archivo temporal.
 * @returns {Promise<{ file: string, isVideo: boolean }>}
 */
async function downloadLink(url) {
  if (!/^https?:\/\//i.test(url)) throw Object.assign(new Error('link inválido'), { userMsg: 'Ese link no es válido.' });
  const base = filepathTemp('stk_link', '');
  const args = [
    '--no-playlist', '--no-warnings', '--no-progress',
    '-f', `b[height<=720][filesize<${MAX_DOWNLOAD}]/b[height<=720]/b`,
    '--max-filesize', MAX_DOWNLOAD,
    '--ffmpeg-location', resolveFfmpegPath(),
    '-o', `${base}.%(ext)s`,
    '--print', 'after_move:filepath', '--no-simulate',
    '--', url,
  ];
  let out;
  try {
    out = await run(ytDlpPath(), args, DOWNLOAD_TIMEOUT_MS);
  } catch (err) {
    throw downloadError(err);
  }
  const file = out.stdout.trim().split('\n').pop();
  if (!file || !existsSync(file)) throw Object.assign(new Error('yt-dlp no dejó archivo'), { userMsg: 'No pude bajar ese link.' });
  const ext = path.extname(file).slice(1).toLowerCase();
  return { file, isVideo: !IMAGE_EXTS.has(ext) };
}

/**
 * Detecta bordes negros/barras con cropdetect sobre los primeros segundos.
 * @returns {Promise<string|null>} filtro "crop=w:h:x:y" o null si no hay bordes
 */
async function detectBorders(file) {
  try {
    const { stderr } = await run(resolveFfmpegPath(), [
      '-hide_banner', '-t', '4', '-i', file, '-vf', 'cropdetect=limit=24:round=2:reset=0', '-an', '-f', 'null', '-',
    ], CROPDETECT_TIMEOUT_MS);
    const all = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
    if (!all.length) return null;
    const [, w, h, x, y] = all[all.length - 1].map(Number);
    if (w < 32 || h < 32) return null; // video casi todo negro: mejor no recortar
    const src = stderr.match(/Video:.*?(\d{2,5})x(\d{2,5})/);
    if (src && Number(src[1]) - w <= BORDER_MIN_PX && Number(src[2]) - h <= BORDER_MIN_PX) return null; // sin bordes reales
    return `crop=${w}:${h}:${x}:${y}`;
  } catch {
    return null;
  }
}

/**
 * Filtro previo al escalado del sticker: quita bordes y, salvo que pidan "completo",
 * recorta un cuadrado. En videos horizontales queda centrado; en verticales se carga
 * hacia arriba (TOP_BIAS) porque ahí suelen ir las caras.
 */
async function buildLinkFilter(file, full, from = 0) {
  if (!full) {
    // TikToks con texto arriba y abajo: si hay una franja 16:9 que se mueve, solo esa.
    const band = await detectCenterBand(file, from);
    if (band) return band;
  }
  const parts = [];
  const borders = await detectBorders(file);
  if (borders) parts.push(borders);
  if (!full) parts.push(`crop='min(iw,ih)':'min(iw,ih)':'(iw-ow)/2':'(ih-oh)*${TOP_BIAS}'`);
  return parts.join(',') || null;
}

module.exports = { findLink, parseLinkBody, downloadLink, buildLinkFilter, detectBorders };
