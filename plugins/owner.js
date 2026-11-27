const logger = require('../utils/logger');
const { getSetting, setSetting, allowGroup, removeGroup } = require('../config/settings');

const OPTIONS = {
  '#grupos': {
    key: 'groups',
    on: 'Listo, el bot ya funciona en grupos.',
    off: 'Listo, el bot ya no funciona en grupos. Tú lo puedes seguir usando.',
    status: (on) => `El bot ${on ? 'funciona' : 'no funciona'} en grupos.`,
  },
  '#privado': {
    key: 'private',
    on: 'Listo, el bot ya funciona en chats privados.',
    off: 'Listo, el bot ya no funciona en chats privados. Tú lo puedes seguir usando.',
    status: (on) => `El bot ${on ? 'funciona' : 'no funciona'} en chats privados.`,
  },
};

async function fetchGroups(sock) {
  const all = Object.values(await sock.groupFetchAllParticipating());
  return all
    .map((g) => ({ id: g.id, name: g.subject || 'Sin nombre' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

async function listGroups(sock, reply) {
  const groups = await fetchGroups(sock);
  if (!groups.length) return reply('El bot no está en ningún grupo.');
  const allowed = getSetting('allowedGroups');
  const lines = groups.map((g, i) => `${i + 1}. ${g.name}${allowed.includes(g.id) ? ' ✅' : ''}`);
  let footer = allowed.length
    ? '✅ = el bot funciona ahí. Usa "#permitir <número>" o "#quitar <número>".'
    : 'El bot funciona en todos los grupos. Usa "#permitir <número>" para que solo funcione en los que elijas.';
  if (getSetting('groups') === false) footer = 'Ahora el bot no funciona en ningún grupo. Usa "#grupos on" para encenderlo.';
  return reply(`Grupos donde está el bot:\n${lines.join('\n')}\n\n${footer}`);
}

async function pickGroup(sock, reply, message, isGroup, arg, cmd) {
  if (!arg) {
    if (!isGroup) {
      await reply(`Escribe el número del grupo, por ejemplo "${cmd} 1". Usa "#listagrupos" para ver la lista.`);
      return null;
    }
    const id = message.key.remoteJid;
    const found = (await fetchGroups(sock)).find((g) => g.id === id);
    return found || { id, name: 'este grupo' };
  }
  const n = Number(arg);
  const groups = await fetchGroups(sock);
  if (!Number.isInteger(n) || n < 1 || n > groups.length) {
    await reply('No hay un grupo con ese número. Usa "#listagrupos" para ver la lista.');
    return null;
  }
  return groups[n - 1];
}

async function permit(sock, reply, message, isGroup, arg) {
  const group = await pickGroup(sock, reply, message, isGroup, arg, '#permitir');
  if (!group) return;
  const first = !getSetting('allowedGroups').length;
  if (!allowGroup(group.id)) return reply(`"${group.name}" ya estaba permitido.`);
  return reply(first
    ? `Listo, ahora el bot solo funciona en "${group.name}". En los otros grupos ya no va a funcionar.`
    : `Listo, el bot también funciona en "${group.name}".`);
}

async function remove(sock, reply, message, isGroup, arg) {
  const group = await pickGroup(sock, reply, message, isGroup, arg, '#quitar');
  if (!group) return;
  if (!removeGroup(group.id)) return reply(`"${group.name}" no estaba en los grupos permitidos.`);
  return reply(getSetting('allowedGroups').length
    ? `Listo, el bot ya no funciona en "${group.name}".`
    : `Listo, quité "${group.name}". Ya no hay grupos elegidos, así que el bot funciona en todos los grupos.`);
}

const handler = async (message, sock, reply, isGroup, body) => {
  const [cmd, arg] = body.trim().toLowerCase().split(/\s+/);
  const groupCmd = { '#listagrupos': listGroups, '#permitir': permit, '#quitar': remove }[cmd];
  if (groupCmd) {
    try {
      return await groupCmd(sock, reply, message, isGroup, arg);
    } catch (e) {
      logger.error(`Error en ${cmd}: ${e?.stack || e}`);
      return reply('No pude ver los grupos del bot. Prueba otra vez.');
    }
  }
  const opt = OPTIONS[cmd];
  if (arg === 'on' || arg === 'off') {
    setSetting(opt.key, arg === 'on');
    return reply(opt[arg]);
  }
  return reply(`${opt.status(getSetting(opt.key) !== false)}\nUsa "${cmd} on" o "${cmd} off".`);
};

module.exports = {
  command: '#grupos',
  aliases: ['#privado', '#listagrupos', '#permitir', '#quitar'],
  ownerOnly: true,
  handler,
};
