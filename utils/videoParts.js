'use strict';

// Utilidades de video para stickers:
// - probeDuration: cuánto dura el video.
// - planParts: cómo partir un video largo en varios stickers.
// - detectCenterBand: encuentra la franja del video "real" en TikToks con texto
//   arriba y abajo (la parte que se mueve), para recortar solo esa.

const { execFile } = require('child_process');
const { resolveFfmpegPath } = require('./ffmpegBin');

const SINGLE_MAX_SECONDS = 12; // hasta aquí va en un solo sticker
const PART_SECONDS = 8; // largo de cada parte cuando hay que partir
const MAX_PARTS = 4; // tope de stickers por video
const MIN_TAIL_SECONDS = 3; // una cola más corta se pega a la parte anterior
const PROBE_TIMEOUT_MS = 20 * 1000;
const BAND_TIMEOUT_MS = 40 * 1000;
const BAND_SAMPLE_SECONDS = 6;
const BAND_PIXEL_DIFF = 10; // un píxel "se movió" si cambió más que esto (0-255)
const BAND_MOTION_LIMIT = 16; // fila/columna cuenta si ~6 % de sus píxeles se mueven
// La altura con movimiento debe parecerse a la de un 16:9 a todo el ancho (ancho*9/16):
// algo menos si el video tiene partes quietas, algo más si hay texto animado pegado.
const BAND_MIN_HEIGHT_FIT = 0.6;
const BAND_MAX_HEIGHT_FIT = 1.25;
const BAND_MAX_HEIGHT_RATIO = 0.8; // la franja debe dejar barras reales arriba/abajo
const BAND_MIN_WIDTH_RATIO = 0.4; // el movimiento no puede ser algo chiquito

const round2 = (n) => Math.round(n * 100) / 100;
const even = (n) => Math.round(n / 2) * 2;

function runFfmpegRaw(args, timeout) {
  return new Promise((resolve) => {
    execFile(resolveFfmpegPath(), args, { timeout, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      // ffmpeg -i sin salida termina con error pero igual imprime la info en stderr
      resolve({ err, stderr: String(stderr || '') });
    });
  });
}

/** Lee "Duration: hh:mm:ss.xx" de la salida de ffmpeg. */
function parseDuration(stderr) {
  const m = String(stderr || '').match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!m) return null;
  const secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  return secs > 0 ? secs : null;
}

/** Duración en segundos, o null si no se pudo leer. */
async function probeDuration(file) {
  const { stderr } = await runFfmpegRaw(['-hide_banner', '-i', file], PROBE_TIMEOUT_MS);
  return parseDuration(stderr);
}

/**
 * Parte un video en trozos para stickers.
 * @param {number|null} duration segundos
 * @returns {{ parts: {start:number,length:number}[], truncated: boolean, covered: number }}
 */
function planParts(duration) {
  if (!Number.isFinite(duration) || duration <= 0) {
    return { parts: [{ start: 0, length: SINGLE_MAX_SECONDS }], truncated: false, covered: SINGLE_MAX_SECONDS };
  }
  if (duration <= SINGLE_MAX_SECONDS) {
    return { parts: [{ start: 0, length: round2(duration) }], truncated: false, covered: round2(duration) };
  }

  const parts = [];
  for (let start = 0; start < duration && parts.length < MAX_PARTS; start += PART_SECONDS) {
    parts.push({ start, length: round2(Math.min(PART_SECONDS, duration - start)) });
  }

  const last = parts[parts.length - 1];
  const reachesEnd = last.start + last.length >= duration - 0.01;
  if (reachesEnd && parts.length > 1 && last.length < MIN_TAIL_SECONDS) {
    const prev = parts[parts.length - 2];
    const merged = [...parts.slice(0, -2), { start: prev.start, length: round2(prev.length + last.length) }];
    return { parts: merged, truncated: false, covered: round2(duration) };
  }

  const covered = round2(last.start + last.length);
  return { parts, truncated: duration - covered > 0.5, covered };
}

/** Tamaño del video ya rotado (como lo ve el filtro). */
function parseFrameSize(stderr) {
  const m = String(stderr || '').match(/Video:.*?\b(\d{2,5})x(\d{2,5})\b/);
  if (!m) return null;
  let w = Number(m[1]);
  let h = Number(m[2]);
  if (/rotation of -?(90|270)/.test(stderr) || /rotate\s*:\s*(90|270)/.test(stderr)) [w, h] = [h, w];
  return { w, h };
}

/**
 * Decide si la zona con movimiento es una franja ~16:9 centrada entre barras.
 * @returns {string|null} filtro crop o null
 */
function bandFromDetection(frame, box) {
  if (!frame || !box) return null;
  const { w, h, y } = box;
  if (w < 64 || h < 64) return null;
  const bandH = even(frame.w * 9 / 16);
  if (bandH > frame.h * BAND_MAX_HEIGHT_RATIO) return null; // video horizontal: no hay barras
  if (h > frame.h * BAND_MAX_HEIGHT_RATIO) return null;
  if (h < bandH * BAND_MIN_HEIGHT_FIT || h > bandH * BAND_MAX_HEIGHT_FIT) return null;
  if (w < frame.w * BAND_MIN_WIDTH_RATIO) return null;
  // Ajusta a 16:9 exacto a todo el ancho, centrado en la zona que se mueve
  // (los bordes quietos del propio video no deben recortarse).
  const top = Math.min(Math.max(even(y + h / 2 - bandH / 2), 0), frame.h - bandH);
  return `crop=${frame.w}:${bandH}:0:${top}`;
}

/**
 * Busca la franja que se mueve (el video "de verdad") comparando cada fotograma
 * con el anterior: el texto y el fondo quietos dan diferencia 0. La diferencia se pasa
 * a blanco/negro para que cropdetect no la diluya al promediar filas y columnas enteras.
 * @returns {Promise<string|null>} "crop=w:h:x:y" o null si no hay franja 16:9
 */
async function detectCenterBand(file) {
  const { stderr } = await runFfmpegRaw([
    '-hide_banner', '-t', String(BAND_SAMPLE_SECONDS), '-i', file, '-an',
    '-vf', 'tblend=all_mode=difference,format=gray,' +
      `lut=y='if(gt(val,${BAND_PIXEL_DIFF}),255,0)',` +
      `cropdetect=limit=${BAND_MOTION_LIMIT}:round=2:reset=0`,
    '-f', 'null', '-',
  ], BAND_TIMEOUT_MS);
  const all = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  if (!all.length) return null;
  const [, w, h, x, y] = all[all.length - 1].map(Number);
  return bandFromDetection(parseFrameSize(stderr), { w, h, x, y });
}

/** Mensaje para avisar que el video va en varias partes. */
function partsNotice(duration, plan) {
  const n = plan.parts.length;
  const secs = Math.round(duration);
  if (plan.truncated) return `El video dura ${secs} s. Van los primeros ${Math.round(plan.covered)} s en ${n} stickers.`;
  return `El video dura ${secs} s, va en ${n} stickers.`;
}

module.exports = {
  SINGLE_MAX_SECONDS,
  PART_SECONDS,
  MAX_PARTS,
  probeDuration,
  planParts,
  detectCenterBand,
  partsNotice,
  _internal: { parseDuration, parseFrameSize, bandFromDetection },
};
