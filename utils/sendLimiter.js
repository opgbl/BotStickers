'use strict';

const logger = require('./logger');
const { hasPriority } = require('./ffmpegQueue');

const STICKER_PER_MIN = 20;
const STICKER_GAP_MS = [1000, 3000];
const GENERAL_GAP_MS = [250, 750];
const DROP_REACTIONS_AT = 15;

const lanes = global.__sendLimiter || (global.__sendLimiter = {
  sticker: { queue: [], running: false, lastAt: 0, sent: [], gap: STICKER_GAP_MS, perMin: STICKER_PER_MIN },
  general: { queue: [], running: false, lastAt: 0, sent: [], gap: GENERAL_GAP_MS, perMin: 0 },
});

const rand = ([min, max]) => min + Math.random() * (max - min);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pump(lane) {
  if (lane.running) return;
  lane.running = true;
  try {
    while (lane.queue.length) {
      let wait = lane.lastAt + rand(lane.gap) - Date.now();
      if (lane.perMin) {
        const now = Date.now();
        while (lane.sent.length && now - lane.sent[0] >= 60000) lane.sent.shift();
        if (lane.sent.length >= lane.perMin) wait = Math.max(wait, lane.sent[0] + 60000 - now);
      }
      if (wait > 0) await sleep(wait);

      const job = lane.queue.shift();
      lane.lastAt = Date.now();
      if (lane.perMin) lane.sent.push(lane.lastAt);

      Promise.resolve().then(job.fn).then(job.resolve, job.reject);
    }
  } finally {
    lane.running = false;
  }
}

function schedule(kind, fn) {
  const urgent = hasPriority();
  if (kind === 'reaction' && !urgent && lanes.general.queue.length >= DROP_REACTIONS_AT) {
    return Promise.resolve(undefined);
  }
  const lane = kind === 'sticker' ? lanes.sticker : lanes.general;
  return new Promise((resolve, reject) => {
    const job = { fn, resolve, reject, urgent };
    const i = urgent ? lane.queue.findIndex((j) => !j.urgent) : -1;
    lane.queue.splice(i < 0 ? lane.queue.length : i, 0, job);
    if (lane.queue.length % 10 === 0) {
      logger.info(`[sendLimiter] ${lane.queue.length} envíos en espera (${kind === 'sticker' ? 'stickers' : 'mensajes'}).`);
    }
    pump(lane);
  });
}

function kindOfContent(content) {
  if (content?.sticker) return 'sticker';
  if (content?.react) return 'reaction';
  return 'general';
}

function kindOfMessage(message) {
  if (message?.stickerMessage || message?.audioStickerMessage) return 'sticker';
  if (message?.reactionMessage) return 'reaction';
  return 'general';
}

function installSendLimiter(sock) {
  if (!sock || sock.__sendLimited) return sock;
  sock.__sendLimited = true;

  const sendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = (jid, content, options) =>
    schedule(kindOfContent(content), () => sendMessage(jid, content, options));

  const relayMessage = sock.relayMessage.bind(sock);
  sock.relayMessage = (jid, message, options) =>
    schedule(kindOfMessage(message), () => relayMessage(jid, message, options));

  return sock;
}

module.exports = { installSendLimiter };
