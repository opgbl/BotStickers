const COMMAND_GAP_MS  = 3 * 1000;
const HEAVY_GAP_MS    = 15 * 1000;
const USER_WINDOW_MS  = 10 * 1000;
const USER_MAX        = 10;
const HEAVY_WINDOW_MS = 60 * 1000;
const HEAVY_MAX       = 3;
const GROUP_WINDOW_MS = 10 * 1000;
const GROUP_MAX       = 25;
const STICKER_WINDOW_MS = 60 * 60 * 1000;
const STICKER_MAX       = 10;

const HEAVY_COMMANDS = new Set(['#s+a', '#tomp4', '#stickertovideo', '#s2mp4', '#recortar', '#1:1', '#1x1', '#square']);

const STICKER_COMMANDS = new Set(['#s', '#sticker', '#stiker', '#s+a']);

const userBuckets    = new Map();
const heavyBuckets   = new Map();
const groupBuckets   = new Map();
const stickerBuckets = new Map();
const lastCommand  = new Map();
const lastHeavy    = new Map();

setInterval(() => {
  const now = Date.now();
  for (const map of [userBuckets, heavyBuckets, groupBuckets, stickerBuckets])
    for (const [id, b] of map)
      if (now >= b.resetAt) map.delete(id);
  for (const [map, gap] of [[lastCommand, COMMAND_GAP_MS], [lastHeavy, HEAVY_GAP_MS]])
    for (const [id, g] of map)
      if (now - g.at >= gap) map.delete(id);
}, 60 * 1000).unref();

function getBucket(map, id, windowMs, now) {
  let b = map.get(id);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs, notified: false };
    map.set(id, b);
  }
  return b;
}

function gapCheck(map, id, gap, now) {
  const g = map.get(id);
  if (!g || now - g.at >= gap) return null;
  const notify = !g.notified;
  g.notified = true;
  return { remaining: Math.max(1, Math.ceil((g.at + gap - now) / 1000)), notify };
}

function checkRateLimit(userId, { chatId, isGroup = false, heavy = false, sticker = false, exempt = false } = {}) {
  const now = Date.now();

  if (!exempt) {
    const gaps = [['cooldown', lastCommand, COMMAND_GAP_MS]];
    if (heavy) gaps.push(['heavyCooldown', lastHeavy, HEAVY_GAP_MS]);
    for (const [reason, map, gap] of gaps) {
      const hit = gapCheck(map, userId, gap, now);
      if (hit) return { limited: true, reason, ...hit, notify: false };
    }
  }

  const checks = [];
  if (!exempt) {
    if (isGroup && chatId) checks.push(['group', getBucket(groupBuckets, chatId, GROUP_WINDOW_MS, now), GROUP_MAX]);
    checks.push(['user', getBucket(userBuckets, userId, USER_WINDOW_MS, now), USER_MAX]);
    if (heavy) checks.push(['heavy', getBucket(heavyBuckets, userId, HEAVY_WINDOW_MS, now), HEAVY_MAX]);
    if (sticker) checks.push(['sticker', getBucket(stickerBuckets, userId, STICKER_WINDOW_MS, now), STICKER_MAX]);
  }

  for (const [reason, b, max] of checks) {
    if (b.count >= max) {
      const notify = !b.notified;
      b.notified = true;
      return { limited: true, reason, remaining: Math.ceil((b.resetAt - now) / 1000), notify };
    }
  }

  for (const [, b] of checks) b.count++;
  if (!exempt) {
    lastCommand.set(userId, { at: now, notified: false });
    if (heavy) lastHeavy.set(userId, { at: now, notified: false });
  }
  return { limited: false };
}

function rateLimitMessage({ reason, remaining }) {
  if (reason === 'sticker') return `Llegaste al límite de ${STICKER_MAX} stickers por hora. Podrás hacer más en ${Math.ceil(remaining / 60)} min.`;
  if (reason === 'group') return `El bot está recibiendo muchos comandos en este grupo. Esperen ${remaining}s.`;
  if (reason === 'heavy') return `Solo puedes usar ${HEAVY_MAX} conversiones por minuto. Espera ${remaining}s.`;
  if (reason === 'heavyCooldown') return `Espera ${remaining}s antes de otra conversión.`;
  if (reason === 'cooldown') return `Espera ${remaining}s entre comandos.`;
  return `Vas muy rápido. Espera ${remaining}s.`;
}

module.exports = { checkRateLimit, rateLimitMessage, HEAVY_COMMANDS, STICKER_COMMANDS };
