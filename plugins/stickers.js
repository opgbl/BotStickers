'use strict';

const fs = require('fs').promises;
const { existsSync } = require('fs');
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const webp = require('node-webpmux');
const logger = require('../utils/logger');
const { downloadContentFromMessage } = require('../utils/baileys');
const { sendReaction, getMessageContent, unwrapMessage, filepathTemp } = require('../utils/common');
const { sendSoundSticker } = require('../utils/soundSticker');
const { FfmpegBusyError } = require('../utils/ffmpegQueue');
const { findLink, parseLinkBody, downloadLink, buildLinkFilter } = require('../utils/linkMedia');
const {
  SINGLE_MAX_SECONDS, probeDuration, planParts, detectCenterBand, partsNotice,
} = require('../utils/videoParts');

ffmpeg.setFfmpegPath(require('../utils/ffmpegBin').resolveFfmpegPath());

const MAX_STICKER_JOBS = 30;
const MAX_VIDEO_DURATION = SINGLE_MAX_SECONDS;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const STICKER_SIZE = 512;
const TARGET_ANIMATED = 480 * 1024;
const TARGET_STATIC = 280 * 1024;
const WAVEFORM_BARS = 32;
const FONT_SIZE = 48;
const MAX_CHARS_PER_LINE = 13;
const PACK_NAME = 'OPglobalBOT';
const DEFAULT_PUBLISHER = 'ᴏɴᴇ ᴘɪᴇᴄᴇ ɢʟᴏʙᴀʟ ʙᴏᴛ';

const IMAGE_EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
};
const VIDEO_EXT = {
  'video/mp4': 'mp4', 'video/mpeg': 'mpeg', 'video/quicktime': 'mov',
  'video/x-msvideo': 'avi', 'video/webm': 'webm', 'video/3gpp': '3gp',
};

const EXIF_HEADER = Buffer.from([
  0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
  0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
]);

const BASE_FILTER =
  `scale=w=${STICKER_SIZE}:h=${STICKER_SIZE}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba,` +
  `pad=width=${STICKER_SIZE}:height=${STICKER_SIZE}:x=(${STICKER_SIZE}-iw)/2:y=(${STICKER_SIZE}-ih)/2:color=0x00000000`;

const IMAGE_QUALITY = [80, 60, 40, 25];

const VIDEO_LEVELS = [
  { fps: 15, q: 40 },
  { fps: 15, q: 18 },
  { fps: 12, q: 8 },
  { fps: 12, q: 2 },
  { fps: 10, q: 1 },
  { fps: 8, q: 1 },
];
const NORMAL_VIDEO_LEVELS = 4;

const FONT_FILE = [
  'C:/Windows/Fonts/arialbd.ttf',
  '/data/data/com.termux/files/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/liberation/LiberationSans-Bold.ttf',
  '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
  '/usr/share/fonts/gnu-free/FreeSansBold.ttf',
].find((f) => existsSync(f)) || null;

let activeJobs = 0;

/** -ss antes del -i: arranca la parte en su segundo (preciso porque se recodifica). */
const seekOpts = (part) => (part && part.start > 0 ? ['-ss', String(part.start)] : []);

function runFfmpeg(input, outputOptions, output, format, filter, inputOptions = []) {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(input);
    if (inputOptions.length) cmd.inputOptions(inputOptions);
    cmd.outputOptions(outputOptions);
    if (filter) cmd.videoFilters(filter);
    if (format) cmd.toFormat(format);
    cmd.on('end', resolve).on('error', reject).save(output);
  });
}

function imageOpts(level) {
  return [
    '-vcodec', 'libwebp', '-q:v', String(IMAGE_QUALITY[level]), '-compression_level', '6',
    '-preset', 'default', '-pix_fmt', 'yuva420p', '-an',
  ];
}

function videoOpts(level, seconds = MAX_VIDEO_DURATION) {
  return [
    '-vcodec', 'libwebp', '-lossless', '0', '-compression_level', '6', '-qscale', String(VIDEO_LEVELS[level].q),
    '-preset', 'default', '-loop', '0', '-an', '-fps_mode', 'passthrough',
    '-auto-alt-ref', '0', '-pix_fmt', 'yuva420p', '-t', String(seconds),
  ];
}

function wrapText(text) {
  const lines = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= MAX_CHARS_PER_LINE) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word.slice(0, MAX_CHARS_PER_LINE);
    }
  }
  if (current) lines.push(current);
  return lines;
}

const escapeFilter = (s) => s.replace(/[\\':[\]]/g, (c) => `\\${c}`);

function buildDrawtextFilter(text) {
  const escaped = wrapText(text).map(escapeFilter).join('\\n');
  const fontPart = FONT_FILE ? `fontfile='${escapeFilter(FONT_FILE)}':` : '';
  return `drawtext=${fontPart}text='${escaped}':fontcolor=white:fontsize=${FONT_SIZE}:` +
    'bordercolor=black:borderw=3:x=(w-text_w)/2:y=h-th-25';
}

function parseOverlayText(body) {
  const match = body.match(/^#s(?:ticker|tiker|\+a)?\s+["“”]([^"“”]+)["“”]/iu)
    || body.match(/^#s(?:ticker|tiker|\+a)?\s+(.+)/iu);
  return match?.[1]?.trim() || null;
}

function getQuotedMessage(m) {
  for (const v of Object.values(m || {})) {
    const quoted = v?.contextInfo?.quotedMessage;
    if (quoted) return unwrapMessage(quoted);
  }
  return null;
}

function getMedia(message) {
  const own = unwrapMessage(message.message);
  const m = own?.imageMessage || own?.videoMessage || own?.documentMessage ? own : getQuotedMessage(own);
  if (!m) return null;
  if (m.imageMessage) return { content: m.imageMessage, type: 'image', isVideo: false, ext: 'jpg' };
  if (m.videoMessage) return { content: m.videoMessage, type: 'video', isVideo: true, ext: 'mp4' };
  if (m.documentMessage) {
    const mime = (m.documentMessage.mimetype || '').split(';')[0].trim().toLowerCase();
    const ext = IMAGE_EXT[mime] || VIDEO_EXT[mime];
    if (!ext) return { unsupported: true };
    return { content: m.documentMessage, type: 'document', isVideo: !!VIDEO_EXT[mime], ext };
  }
  return { invalid: true };
}

async function downloadMedia(content, type) {
  const chunks = [];
  for await (const chunk of await downloadContentFromMessage(content, type)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function convertToWebP(input, isVideo, overlayText, maxLevels, preFilter = null, part = null) {
  const output = filepathTemp('stk_out', '.webp');
  const target = isVideo ? TARGET_ANIMATED : TARGET_STATIC;
  const levels = isVideo ? maxLevels : IMAGE_QUALITY.length;
  const textPart = overlayText ? `,${buildDrawtextFilter(overlayText)}` : '';
  const base = preFilter ? `${preFilter},${BASE_FILTER}` : BASE_FILTER;
  let best = null;

  try {
    for (let level = 0; level < levels; level++) {
      const filter = isVideo ? `${base},fps=${VIDEO_LEVELS[level].fps}${textPart}` : `${base}${textPart}`;
      const opts = isVideo ? videoOpts(level, part?.length) : imageOpts(level);
      await runFfmpeg(input, opts, output, 'webp', filter, isVideo ? seekOpts(part) : []);
      const result = await fs.readFile(output);
      if (result.length <= target) return result;
      if (!best || result.length < best.length) best = result;
      if (isVideo && result.length > target * 1.8 && level + 2 < levels) level++;
    }
    logger.warn(`Sticker quedó en ${(best.length / 1024).toFixed(0)}KB tras máxima compresión`);
    return best;
  } finally {
    await fs.unlink(output).catch(() => {});
  }
}

function oggOpusDuration(buf) {
  try {
    const last = buf.lastIndexOf('OggS');
    const head = buf.indexOf('OpusHead');
    if (last < 0 || head < 0) return null;
    const granule = Number(buf.readBigUInt64LE(last + 6));
    return Math.max(0, granule - buf.readUInt16LE(head + 10)) / 48000;
  } catch {
    return null;
  }
}

async function audioWaveform(oggPath) {
  const pcmPath = filepathTemp('stk_pcm', '.pcm');
  try {
    await runFfmpeg(oggPath, ['-f', 's16le', '-ac', '1', '-ar', '8000'], pcmPath);
    const pcm = await fs.readFile(pcmPath);
    const samples = pcm.length >> 1;
    if (!samples) return null;
    const per = Math.max(1, Math.floor(samples / WAVEFORM_BARS));
    const peaks = new Array(WAVEFORM_BARS).fill(0);
    for (let b = 0; b < WAVEFORM_BARS; b++) {
      const end = Math.min(samples, (b + 1) * per);
      for (let i = b * per; i < end; i++) {
        const v = Math.abs(pcm.readInt16LE(i * 2));
        if (v > peaks[b]) peaks[b] = v;
      }
    }
    const max = Math.max(...peaks) || 1;
    return Buffer.from(peaks.map((p) => Math.round((p / max) * 99)));
  } catch {
    return null;
  } finally {
    await fs.unlink(pcmPath).catch(() => {});
  }
}

async function extractAudio(input, part) {
  const output = filepathTemp('stk_aud', '.ogg');
  const duration = Math.min(part?.length || MAX_VIDEO_DURATION, MAX_VIDEO_DURATION);
  try {
    await runFfmpeg(input, [
      '-vn', '-map', '0:a:0', '-af', 'aresample=48000:async=1:first_pts=0',
      '-t', String(duration), '-c:a', 'libopus', '-b:a', '48k',
      '-ac', '1', '-ar', '48000', '-application', 'audio', '-map_metadata', '-1',
    ], output, 'ogg', null, seekOpts(part));
    const audio = await fs.readFile(output);
    const real = oggOpusDuration(audio);
    if (audio.length <= 1024 || (real !== null && real < 0.3)) return null;
    const waveform = await audioWaveform(output);
    return { audio, seconds: Math.max(1, Math.round(real ?? duration)), waveform };
  } catch (e) {
    if (!/stream/i.test(e.message)) logger.warn(`[#s] No se pudo extraer el audio: ${e.message}`);
    return null;
  } finally {
    await fs.unlink(output).catch(() => {});
  }
}

async function addExifMetadata(webpBuffer, creatorName) {
  try {
    const json = Buffer.from(JSON.stringify({
      'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
      'sticker-pack-name': PACK_NAME,
      'sticker-pack-publisher': creatorName ? ` ${creatorName}` : DEFAULT_PUBLISHER,
      emojis: ['🎭'],
    }), 'utf8');
    const exif = Buffer.concat([EXIF_HEADER, json]);
    exif.writeUInt32LE(json.length, 14);
    const img = new webp.Image();
    await img.load(webpBuffer);
    img.exif = exif;
    return await img.save(null);
  } catch (e) {
    logger.error(`Error agregando EXIF: ${e.message}`);
    return webpBuffer;
  }
}

function getErrorMessage(error) {
  if (error.userMsg) return error.userMsg;
  const msg = error.message?.toLowerCase() || '';
  if (msg.includes('decode')) return 'No se pudo leer el archivo. Prueba con otra imagen, video o gif.';
  if (msg.includes('timeout')) return 'El proceso tardó demasiado.';
  if (msg.includes('ffmpeg')) return 'No se pudo convertir. Prueba con otra imagen o video.';
  return 'Error al procesar el sticker.';
}

/** Envía un sticker (con sonido si hay). No pone la reacción final. */
async function deliverSticker(sock, message, { webpBuffer, sound, creatorName }) {
  const jid = message.key.remoteJid;
  const sticker = await addExifMetadata(webpBuffer, creatorName);
  if (sound) return sendSoundSticker(sock, jid, { sticker, ...sound }, { quoted: message });
  return sock.sendMessage(jid, { sticker, secureMetaServiceLabel: true }, { quoted: message });
}

/**
 * Convierte la imagen o el video en sticker(s) y los envía.
 * Videos de más de 12 s se parten en varios stickers (ver utils/videoParts).
 */
async function makeAndSendStickers({ sock, message, reply, input, isVideo, overlayText, withSound, creatorName, preFilter }) {
  if (!isVideo) {
    const webpBuffer = await convertToWebP(input, false, overlayText, 0, preFilter);
    await deliverSticker(sock, message, { webpBuffer, creatorName });
    return sendReaction(sock, message, '✅');
  }

  const duration = await probeDuration(input);
  const plan = planParts(duration);
  if (plan.parts.length > 1) await reply(partsNotice(duration, plan));
  const levels = withSound ? VIDEO_LEVELS.length : NORMAL_VIDEO_LEVELS;

  let sent = 0;
  for (const part of plan.parts) {
    try {
      const audioJob = withSound ? extractAudio(input, part) : null;
      const webpBuffer = await convertToWebP(input, true, overlayText, levels, preFilter, part)
        .finally(() => audioJob);
      const sound = await audioJob;
      if (withSound && !sound && sent === 0) await reply('El video no tiene audio, va como sticker normal.');
      await deliverSticker(sock, message, { webpBuffer, sound, creatorName });
      sent++;
    } catch (error) {
      if (sent === 0) throw error;
      logger.error(`Error en la parte ${sent + 1} del sticker: ${error?.stack || error}`);
      await reply(`Solo salieron ${sent} de ${plan.parts.length} stickers.`);
      break;
    }
  }
  return sendReaction(sock, message, '✅');
}

/** #s <link> [completo] ["texto"]: baja el video del link y lo vuelve sticker centrado. */
async function stickerFromLink({ message, sock, reply, fail, link, body, withSound, creatorName }) {
  if (activeJobs >= MAX_STICKER_JOBS) return sendReaction(sock, message, '🕐');
  activeJobs++;
  let input = null;
  try {
    await sendReaction(sock, message, '⏳');
    const { body: cleanBody, full } = parseLinkBody(body);
    const downloaded = await downloadLink(link);
    input = downloaded.file;
    if (withSound && !downloaded.isVideo) return await fail('#s+a es para videos con audio. Ese link es una imagen.');

    const preFilter = await buildLinkFilter(input, full);
    await makeAndSendStickers({
      sock, message, reply, input, isVideo: downloaded.isVideo,
      overlayText: parseOverlayText(cleanBody), withSound, creatorName, preFilter,
    });
  } catch (error) {
    if (error instanceof FfmpegBusyError) return sendReaction(sock, message, '🕐');
    logger.error(`Error en #s con link: ${error?.stack || error}`);
    await fail(getErrorMessage(error));
  } finally {
    activeJobs--;
    if (input) await fs.unlink(input).catch(() => {});
  }
}

const sizeText = (bytes) => `Pesa ${(bytes / 1048576).toFixed(1)}MB. Máximo ${MAX_FILE_SIZE / 1048576}MB.`;

const handler = async (message, sock, reply) => {
  const jid = message.key.remoteJid;
  const body = getMessageContent(message);
  const withSound = body.split(/\s+/, 1)[0].toLowerCase() === '#s+a';
  const senderId = (message.key.participant || jid).replace(/:\d+@/, '@');
  const creatorName = message.pushName || senderId.split('@')[0];

  const fail = async (text) => {
    await sendReaction(sock, message, '❌');
    return reply(text);
  };

  const media = getMedia(message);
  const link = !media || media.invalid ? findLink(body) : null;
  if (link) return stickerFromLink({ message, sock, reply, fail, link, body, withSound, creatorName });
  if (!media) return fail(withSound ? 'Responde a un video con "#s+a".' : 'Responde a una imagen o video con "#s", o manda "#s <link>" de TikTok, Instagram, YouTube, X o Facebook.');
  if (media.invalid) return fail('Formato no compatible. Envía una imagen, un video o un gif.');
  if (media.unsupported) return fail('Formato no compatible. Envía JPG, PNG, GIF, WEBP, BMP, MP4, WEBM, MOV, AVI o 3GP.');
  if (withSound && !media.isVideo) return fail('#s+a es para videos con audio. Para imágenes usa #s.');

  const declaredSize = Number(media.content.fileLength) || 0;
  if (declaredSize > MAX_FILE_SIZE) return fail(sizeText(declaredSize));

  if (activeJobs >= MAX_STICKER_JOBS) return sendReaction(sock, message, '🕐');
  activeJobs++;

  const input = filepathTemp('stk_in', `.${media.ext}`);
  try {
    await sendReaction(sock, message, '⏳');
    const buffer = await downloadMedia(media.content, media.type);
    if (buffer.length > MAX_FILE_SIZE) return await fail(sizeText(buffer.length));
    await fs.writeFile(input, buffer);

    // "completo" = sin recortar la franja del centro
    const { body: cleanBody, full } = parseLinkBody(body);
    const preFilter = media.isVideo && !full ? await detectCenterBand(input) : null;
    await makeAndSendStickers({
      sock, message, reply, input, isVideo: media.isVideo,
      overlayText: parseOverlayText(cleanBody), withSound, creatorName, preFilter,
    });
  } catch (error) {
    if (error instanceof FfmpegBusyError) return sendReaction(sock, message, '🕐');
    logger.error(`Error en #sticker: ${error?.stack || error}`);
    await fail(getErrorMessage(error));
  } finally {
    activeJobs--;
    await fs.unlink(input).catch(() => {});
  }
};

module.exports = {
  command: '#s',
  aliases: ['#sticker', '#stiker', '#s+a'],
  handler,
  _internal: { convertToWebP, extractAudio, makeAndSendStickers },
};
