'use strict';

const fs = require('fs');
const path = require('path');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const logger = require('./utils/logger');
const { getMessageContent } = require('./utils/common');
const { checkRateLimit, rateLimitMessage, HEAVY_COMMANDS, STICKER_COMMANDS } = require('./utils/rateLimit');
const { isOwner, isOwnerMessage, addOwner, OWNERS } = require('./config/owner');
const { installSoundStickerSupport } = require('./utils/soundSticker');
const { installSendLimiter } = require('./utils/sendLimiter');
const { installGroupCache, cachedGroupMetadata } = require('./utils/groupCache');
const { startTempCleaner } = require('./utils/tempCleaner');
require('./utils/ffmpegQueue').installFluentFfmpegQueue();

const commands = new Map();
for (const name of ['stickers', 'toimg', 'tomp4', 'namesticker', 'recortar']) {
  const plugin = require(`./plugins/${name}`);
  for (const c of [plugin.command, ...(plugin.aliases || [])]) commands.set(c, plugin.handler);
}

const AUTH_DIR = path.join(__dirname, 'baileys_auth_info');
const QR_FILE = path.join(__dirname, 'qr.txt');
let pairingNumber = (process.env.PAIRING_NUMBER || '').replace(/\D/g, '');
let pairingAsked = !!pairingNumber;
let sessionReset = false;

function askPairingNumber() {
  if (!process.stdin.isTTY) return Promise.resolve('');
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (q) => new Promise((resolve) => rl.question(q, (a) => resolve(String(a || '').trim())));
  const askMode = async () => {
    console.log('\n¿Cómo quieres vincular el bot?');
    console.log('1. Con código');
    console.log('2. Con QR');
    const mode = await question('Escribe 1 o 2: ');
    if (mode === '1' || mode === '2') return mode;
    console.log('Opción no válida.');
    return askMode();
  };
  const askNumber = async () => {
    console.log('\nEscribe el número de WhatsApp del bot todo junto, sin espacios y con el código de país.');
    console.log('Ejemplo: 50212345678 o +50212345678.');
    const num = (await question('Número: ')).replace(/\D/g, '');
    if (num.length >= 8 && num.length <= 15) return num;
    console.log('Número no válido. Escríbelo todo junto con el código de país, por ejemplo 50212345678 o +50212345678.');
    return askNumber();
  };
  return askMode()
    .then((mode) => (mode === '1' ? askNumber() : ''))
    .finally(() => rl.close());
}

function askOwnerNumber() {
  if (!process.stdin.isTTY || OWNERS.length) return Promise.resolve();
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\nEscribe tu número personal todo junto, sin espacios y con el código de país.');
  console.log('Ejemplo: 50212345678 o +50212345678. Déjalo vacío para omitir.');
  const ask = () => new Promise((resolve) => {
    rl.question('Número del dueño: ', (answer) => {
      const num = String(answer || '').replace(/\D/g, '');
      if (!num) return resolve();
      if (num.length < 8 || num.length > 15) {
        console.log('Número no válido. Escríbelo todo junto con el código de país, por ejemplo 50212345678 o +50212345678.');
        return resolve(ask());
      }
      try {
        addOwner(num);
        console.log(`Dueño guardado: ${num}`);
      } catch (e) {
        console.log(`No se pudo guardar el dueño: ${e.message}`);
      }
      resolve();
    });
  });
  return ask().finally(() => rl.close());
}

let sock = null;
let connectionInProgress = false;
let reconnectTimer = null;
let reconnectAttempts = 0;
let pairingRequested = false;

const sentIds = new Set();
function rememberSent(id) {
  if (!id) return;
  sentIds.add(id);
  if (sentIds.size > 500) sentIds.delete(sentIds.values().next().value);
}

function trackSentMessages(s) {
  const sendMessage = s.sendMessage.bind(s);
  s.sendMessage = async (jid, content, options) => {
    const sent = await sendMessage(jid, content, options);
    rememberSent(sent?.key?.id);
    return sent;
  };
  const relayMessage = s.relayMessage.bind(s);
  s.relayMessage = async (jid, msg, options) => {
    rememberSent(options?.messageId);
    const id = await relayMessage(jid, msg, options);
    rememberSent(id);
    return id;
  };
}

async function handleMessage(message) {
  if (!message?.message) return;
  const fromMe = !!message.key.fromMe;
  if (fromMe && sentIds.has(message.key.id)) return;
  const chatId = message.key.remoteJid;
  if (!chatId || chatId === 'status@broadcast' || chatId.endsWith('@newsletter')) return;

  const body = getMessageContent(message);
  if (!body) return;
  const cmd = body.split(/\s+/, 1)[0].toLowerCase();
  const handler = commands.get(cmd);
  if (!handler) return;

  const isGroup = chatId.endsWith('@g.us');
  const senderId = (message.key.participant || chatId).replace(/:\d+@/, '@');

  const reply = async (txt) => {
    try {
      return await sock.sendMessage(chatId, { text: txt }, { quoted: message });
    } catch (err) {
      logger.error(`Error en reply: ${err.message}`);
    }
  };

  const limit = checkRateLimit(senderId, {
    chatId,
    isGroup,
    heavy: HEAVY_COMMANDS.has(cmd),
    sticker: STICKER_COMMANDS.has(cmd),
    exempt: fromMe || isOwnerMessage(message.key, senderId),
  });
  if (limit.limited) {
    if (limit.notify) await reply(rateLimitMessage(limit));
    return;
  }

  try {
    await handler(message, sock, reply, isGroup);
  } catch (e) {
    logger.error(`Error ejecutando ${cmd}: ${e?.stack || e}`);
  }
}

async function handleMessagesUpsert({ messages, type }) {
  if (type === 'append' || type === 'prepend') return;
  for (const message of messages || []) {
    try {
      await handleMessage(message);
    } catch (e) {
      logger.error(`Error procesando mensaje: ${e.message}`);
    }
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = Math.min(5000 * (2 ** reconnectAttempts), 5 * 60 * 1000);
  reconnectAttempts++;
  logger.info(`Nuevo intento de conexión en ${Math.round(delay / 1000)} segundos.`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToWhatsApp();
  }, delay);
}

async function connectToWhatsApp() {
  if (connectionInProgress) return;
  connectionInProgress = true;

  try {
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
      makeCacheableSignalKeyStore,
      Browsers,
      proto,
    } = await import('@whiskeysockets/baileys');
    installSoundStickerSupport(proto, logger);

    const baileysLogger = pino({ level: 'silent' });
    let { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    if (!state.creds.registered && !sessionReset) {
      sessionReset = true;
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      ({ state, saveCreds } = await useMultiFileAuthState(AUTH_DIR));
    }
    if (!state.creds.registered && !pairingAsked) {
      pairingAsked = true;
      pairingNumber = await askPairingNumber();
      await askOwnerNumber();
    }
    const { version } = await fetchLatestBaileysVersion();

    const currentSock = makeWASocket({
      version,
      browser: Browsers.ubuntu('Chrome'),
      logger: baileysLogger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
      },
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 10000,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      getMessage: async () => undefined,
      cachedGroupMetadata,
    });
    installSendLimiter(currentSock);
    trackSentMessages(currentSock);
    installGroupCache(currentSock);
    sock = currentSock;

    currentSock.ev.on('creds.update', saveCreds);

    if (!state.creds.registered && !pairingRequested) {
      if (pairingNumber) {
        pairingRequested = true;
        setTimeout(async () => {
          try {
            const code = (await currentSock.requestPairingCode(pairingNumber)).match(/.{1,4}/g).join('-');
            console.log(`\nCódigo de vinculación: ${code}`);
            console.log('En WhatsApp: Dispositivos vinculados > Vincular un dispositivo > Vincular con el número de teléfono.');
            console.log(`Si WhatsApp dice que el código no es válido, revisa que el número +${pairingNumber} esté bien escrito.`);
            const startCmd = process.platform === 'win32' ? 'abre iniciar.bat' : 'escribe: bash start.sh';
            console.log(`Si está mal, cierra el bot con Ctrl+C y vuelve a iniciarlo para escribirlo otra vez (${startCmd}).`);
            logger.info(`CÓDIGO DE VINCULACIÓN: ${code}`);
          } catch (e) {
            pairingRequested = false;
            logger.error(`No se pudo pedir el código de vinculación: ${e.message}`);
          }
        }, 3000);
      }
    }

    currentSock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr && !pairingNumber) {
        qrcode.generate(qr, { small: true });
        try { fs.writeFileSync(QR_FILE, qr); } catch {}
        logger.info('QR nuevo listo para escanear (qr.txt).');
      }

      if (connection === 'close') {
        if (currentSock !== sock) return;
        const error = lastDisconnect?.error;
        const code = error?.output?.statusCode ?? error?.data?.reason ?? error?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        logger.warn(`Conexión cerrada. Código: ${code}. Detalle: ${error?.message || 'sin detalle'}.`);
        if (code === 403) logger.error('Código 403: WhatsApp suspendió este número.');
        if (loggedOut) {
          logger.error('Sesión cerrada por WhatsApp. Borra baileys_auth_info y vuelve a vincular.');
          return;
        }

        if (code === DisconnectReason.restartRequired) reconnectAttempts = 0;

        if (!state.creds.registered) pairingRequested = false;
        scheduleReconnect();
      }

      if (connection === 'open') {
        reconnectAttempts = 0;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        try { fs.unlinkSync(QR_FILE); } catch {}
        logger.info('Bot Conectado');
        startTempCleaner();
      }
    });

    currentSock.ev.on('messages.upsert', handleMessagesUpsert);
  } catch (error) {
    logger.error(`No se pudo iniciar la conexión: ${error?.stack || error}`);
    scheduleReconnect();
  } finally {
    connectionInProgress = false;
  }
}

process.on('unhandledRejection', (r) => logger.error(`Unhandled Rejection: ${r?.stack || r}`));
process.on('uncaughtException', (e) => logger.error(`Uncaught Exception: ${e?.stack || e}`));

connectToWhatsApp();
