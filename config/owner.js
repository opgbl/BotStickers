const fs = require('fs');
const path = require('path');

const OWNERS_FILE = path.join(__dirname, 'owners.json');

const cleanNumber = (n) => String(n || '').replace(/\D/g, '');

function loadSaved() {
  try {
    const list = JSON.parse(fs.readFileSync(OWNERS_FILE, 'utf8'));
    return Array.isArray(list) ? list.map(cleanNumber).filter(Boolean) : [];
  } catch {
    return [];
  }
}

const saved = loadSaved();
const OWNERS = [...new Set([
  ...saved,
  ...String(process.env.OWNER_NUMBERS || '').split(',').map(cleanNumber).filter(Boolean),
])];

function addOwner(number) {
  const n = cleanNumber(number);
  if (!n || saved.includes(n)) return;
  saved.push(n);
  if (!OWNERS.includes(n)) OWNERS.push(n);
  fs.writeFileSync(OWNERS_FILE, JSON.stringify(saved, null, 2));
}

function isOwner(senderId) {
  const normalized = cleanNumber(String(senderId || '').split('@')[0].split(':')[0]);
  return !!normalized && OWNERS.includes(normalized);
}

const AUTH_DIR = path.join(__dirname, '..', 'baileys_auth_info');

/** Número real detrás de un LID (WhatsApp oculta el número), según el mapeo que guarda Baileys. */
function phoneFromLid(jid) {
  const s = String(jid || '');
  if (!s.endsWith('@lid')) return null;
  const lid = cleanNumber(s.split('@')[0].split(':')[0]);
  if (!lid) return null;
  try {
    return cleanNumber(JSON.parse(fs.readFileSync(path.join(AUTH_DIR, `lid-mapping-${lid}_reverse.json`), 'utf8')));
  } catch {
    return null;
  }
}

/**
 * ¿El mensaje es de un dueño? Revisa el remitente, su JID alterno (número real cuando
 * WhatsApp manda un LID) y, si hace falta, el mapeo LID → número de la sesión.
 */
function isOwnerMessage(key, senderId) {
  const candidates = [senderId, key?.participantAlt, key?.remoteJidAlt, key?.senderPn, phoneFromLid(senderId)];
  return candidates.some((c) => c && isOwner(c));
}

module.exports = { OWNERS, isOwner, isOwnerMessage, addOwner };
