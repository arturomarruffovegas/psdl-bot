// commands/players.js
const { EmbedBuilder } = require('discord.js');
const playerService    = require('../services/playerService');
const { formatList }   = require('../utils/format');

module.exports = {
  name: ['!players', '!cores', '!supports'],
  async execute(message, args, commandName) {
    // 1) Fetch y filtro de activos
    const allPlayers = (await playerService.fetchAllPlayers())
      .filter(p => p.active !== false);

    // 1b) Ordenar: core primero, luego tier asc, luego id
    allPlayers.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'core' ? -1 : 1;
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.id.localeCompare(b.id);
    });

    // 2) Determinar título y lista según comando
    let title = '';
    let list  = '';

    if (commandName === '!players') {
      if (args.length === 1 && args[0].startsWith('t')) {
        const tier = parseInt(args[0].substring(1), 10);
        const filtered = allPlayers.filter(p => p.tier === tier);
        if (filtered.length === 0) {
          return message.channel.send(`⚠️ No players found in Tier ${tier}.`);
        }
        title = `🎯 Tier ${tier} Players (${filtered.length})`;
        list  = formatList(filtered);
      } else {
        if (allPlayers.length === 0) {
          return message.channel.send(`⚠️ No registered players found.`);
        }
        title = `📋 Registered Players (${allPlayers.length})`;
        list  = formatList(allPlayers);
      }

    } else if (commandName === '!cores') {
      const cores = allPlayers.filter(p => p.role === 'core');
      if (args.length === 1 && args[0].startsWith('t')) {
        const tier = parseInt(args[0].substring(1), 10);
        const tiered = cores.filter(p => p.tier === tier);
        if (tiered.length === 0) {
          return message.channel.send(`⚠️ No core players found in Tier ${tier}.`);
        }
        title = `🔥 Core Tier ${tier} (${tiered.length})`;
        list  = formatList(tiered);
      } else {
        if (cores.length === 0) {
          return message.channel.send(`⚠️ No core players found.`);
        }
        title = `🔥 Cores (${cores.length})`;
        list  = formatList(cores);
      }

    } else { // !supports
      const supports = allPlayers.filter(p => p.role === 'support');
      if (args.length === 1 && args[0].startsWith('t')) {
        const tier = parseInt(args[0].substring(1), 10);
        const tiered = supports.filter(p => p.tier === tier);
        if (tiered.length === 0) {
          return message.channel.send(`⚠️ No support players found in Tier ${tier}.`);
        }
        title = `🛡️ Support Tier ${tier} (${tiered.length})`;
        list  = formatList(tiered);
      } else {
        if (supports.length === 0) {
          return message.channel.send(`⚠️ No support players found.`);
        }
        title = `🛡️ Supports (${supports.length})`;
        list  = formatList(supports);
      }
    }

    // 3) Preparar líneas en formato “tabla” monoespaciada
    const header = '`ID`.           `ROLE`   `TI`\n'
                 + '────────────────────────────\n';
    const lines = list.split('\n').map(line => {
      const m = /• `(.+?)` — \((\w+)\s*-\s*T(\d)\)/.exec(line);
      if (m) {
        const [_, id, role, tier] = m;
        const colId   = id.padEnd(12, ' ');
        const colRole = role.padEnd(7, ' ');
        const colTi   = `T${tier}`;
        return `\`${colId}\` \`${colRole}\` \`${colTi}\``;
      }
      return line;
    });

    // 4) Chunking y envío de Embeds
    const MAX = 2000;
    let chunk = header;
    for (const ln of lines) {
      if ((chunk + ln + '\n```').length > MAX) {
        const embed = new EmbedBuilder()
          .setTitle('PSDL – Peruvian Streamers DotA League')
          .setColor(0x0099FF)
          .setDescription('```' + chunk + '```');
        await message.channel.send({ embeds: [embed] });
        chunk = '';
      }
      chunk += ln + '\n';
    }
    if (chunk.trim()) {
      const embed = new EmbedBuilder()
        .setTitle('PSDL – Peruvian Streamers DotA League')
        .setColor(0x0099FF)
        .setDescription('```' + chunk + '```');
      await message.channel.send({ embeds: [embed] });
    }
  }
};
