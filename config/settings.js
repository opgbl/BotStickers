const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const DEFAULTS = { groups: true, private: true, allowedGroups: [] };

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    const merged = { ...DEFAULTS, ...(data && typeof data === 'object' ? data : {}) };
    if (!Array.isArray(merged.allowedGroups)) merged.allowedGroups = [];
    return merged;
  } catch {
    return { ...DEFAULTS, allowedGroups: [] };
  }
}

const settings = load();

function save() {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function getSetting(name) {
  return settings[name];
}

function setSetting(name, value) {
  settings[name] = value;
  save();
}

function allowGroup(id) {
  if (settings.allowedGroups.includes(id)) return false;
  settings.allowedGroups.push(id);
  save();
  return true;
}

function removeGroup(id) {
  const i = settings.allowedGroups.indexOf(id);
  if (i < 0) return false;
  settings.allowedGroups.splice(i, 1);
  save();
  return true;
}

function isChatAllowed(isGroup, chatId) {
  if (!isGroup) return settings.private !== false;
  if (settings.groups === false) return false;
  return !settings.allowedGroups.length || settings.allowedGroups.includes(chatId);
}

module.exports = { getSetting, setSetting, allowGroup, removeGroup, isChatAllowed };
