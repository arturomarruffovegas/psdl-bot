// commands/players.js
const { EmbedBuilder } = require('discord.js');
const playerService    = require('../services/playerService');
const { formatList }   = require('../utils/format');

module.exports = {
  name: ['!players', '!cores', '!supports'],
  async execute(message, args, commandName) {
    // 1) Fetch and filter active players
    const allPlayers = (await playerService.fetchAllPlayers())
      .filter(p => p.active !== false);

    // Total counts
    const totalCount = allPlayers.length;
    const coreCount  = allPlayers.filter(p => p.role === 'core').length;
    const supCount   = allPlayers.filter(p => p.role === 'support').length;

    // 2) Sort: core first, then tier asc, then id
    allPlayers.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'core' ? -1 : 1;
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.id.localeCompare(b.id);
    });

    // 3) Determine title and list
    let title = '';
    let list  = '';

    if (commandName === '!players') {
      // Optional tier filter
      if (args.length === 1 && args[0].startsWith('t')) {
        const tier = parseInt(args[0].substring(1), 10);
        const filtered = allPlayers.filter(p => p.tier === tier);
        if (filtered.length === 0) {
          return message.channel.send(`⚠️ No players found in Tier ${tier}.`);
        }
        title = `📋 Tier ${tier} Players (${filtered.length}) — Total Active: ${totalCount}`;
        list  = formatList(filtered);
      } else {
        if (allPlayers.length === 0) {
          return message.channel.send(`⚠️ No registered players found.`);
        }
        title = `📋 Registered Players (${allPlayers.length}) — Total Active: ${totalCount}`;
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
        title = `🔥 Core Tier ${tier} (${tiered.length}) — Total Cores: ${coreCount}`;
        list  = formatList(tiered);
      } else {
        if (cores.length === 0) {
          return message.channel.send(`⚠️ No core players found.`);
        }
        title = `🔥 Cores (${cores.length}) — Total Cores: ${coreCount}`;
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
        title = `🛡️ Support Tier ${tier} (${tiered.length}) — Total Supports: ${supCount}`;
        list  = formatList(tiered);
      } else {
        if (supports.length === 0) {
          return message.channel.send(`⚠️ No support players found.`);
        }
        title = `🛡️ Supports (${supports.length}) — Total Supports: ${supCount}`;
        list  = formatList(supports);
      }
    }

    // 4) Prepare monospaced table lines
    const header = '`ID`.           `ROLE`   `TI`'
                 + '────────────────────────────';
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

    // 5) Chunk and send embeds
    const MAX = 2000;
    let chunk = header;
    for (const ln of lines) {
      if ((chunk + ln + '\n```').length > MAX) {
        const embed = new EmbedBuilder()
          .setTitle(title)
          .setColor(0x0099FF)
          .setDescription('```' + chunk + '```');
        await message.channel.send({ embeds: [embed] });
        chunk = '';
      }
      chunk += ln + '\n';
    }
    if (chunk.trim()) {
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x0099FF)
        .setDescription('```' + chunk + '```');
      await message.channel.send({ embeds: [embed] });
    }
  }
};
