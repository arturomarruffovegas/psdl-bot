const playerService = require('../services/playerService');
const { formatList } = require('../utils/format');

module.exports = {
  name: ['!players', '!cores', '!supports'],
  async execute(message, args, commandName) {
    // fetch all active players
    const allPlayers = (await playerService.fetchAllPlayers())
      .filter(p => p.active !== false);

    // Handle !players
    if (commandName === '!players') {
      if (args.length === 1 && args[0].startsWith('t')) {
        const tier = parseInt(args[0].substring(1), 10);
        const filtered = allPlayers.filter(p => p.tier === tier);
        if (filtered.length === 0) {
          return message.channel.send(`⚠️ No players found in Tier ${tier}.`);
        }
        return message.channel.send(
          `🎯 **Tier ${tier} Players (${filtered.length})**\n` +
          formatList(filtered)
        );
      }

      if (allPlayers.length === 0) {
        return message.channel.send(`⚠️ No registered players found.`);
      }
      return message.channel.send(
        `📋 **Registered Players (${allPlayers.length})**\n` +
        formatList(allPlayers)
      );
    }

    // Handle !cores
    if (commandName === '!cores') {
      const cores = allPlayers.filter(p => p.role === 'core');

      // tier filter
      if (args.length === 1 && args[0].startsWith('t')) {
        const tier = parseInt(args[0].substring(1), 10);
        const tiered = cores.filter(p => p.tier === tier);
        if (tiered.length === 0) {
          return message.channel.send(`⚠️ No core players found in Tier ${tier}.`);
        }
        return message.channel.send(
          `🔥 **Core Players Tier ${tier} (${tiered.length})**\n` +
          formatList(tiered)
        );
      }

      if (cores.length === 0) {
        return message.channel.send(`⚠️ No core players found.`);
      }
      return message.channel.send(
        `🔥 **Cores (${cores.length})**\n` +
        formatList(cores)
      );
    }

    // Handle !supports
    if (commandName === '!supports') {
      const supports = allPlayers.filter(p => p.role === 'support');

      // tier filter
      if (args.length === 1 && args[0].startsWith('t')) {
        const tier = parseInt(args[0].substring(1), 10);
        const tiered = supports.filter(p => p.tier === tier);
        if (tiered.length === 0) {
          return message.channel.send(`⚠️ No support players found in Tier ${tier}.`);
        }
        return message.channel.send(
          `🛡️ **Support Players Tier ${tier} (${tiered.length})**\n` +
          formatList(tiered)
        );
      }

      if (supports.length === 0) {
        return message.channel.send(`⚠️ No support players found.`);
      }
      return message.channel.send(
        `🛡️ **Supports (${supports.length})**\n` +
        formatList(supports)
      );
    }
  }
};
