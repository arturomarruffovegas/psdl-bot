const playerService = require('../services/playerService');
const { formatList } = require('../utils/format');

module.exports = {
    name: ['!players', '!cores', '!supports'],
    async execute(message, args, commandName) {
        const allPlayers = (await playerService.fetchAllPlayers()).filter(p => p.active !== false);

        if (commandName === '!players') {
            // e.g. !players or !players t3
            if (args.length === 1 && args[0].startsWith('t')) {
                const tier = parseInt(args[0].substring(1));
                const filtered = allPlayers.filter(p => p.tier === tier);
                if (filtered.length === 0) return message.channel.send(`⚠️ No players found in Tier ${tier}.`);
                return message.channel.send(`🎯 **Tier ${tier} Players (${filtered.length})**\n${formatList(filtered)}`);
            }

            if (allPlayers.length === 0) return message.channel.send(`⚠️ No registered players found.`);
            return message.channel.send(`📋 **Registered Players (${allPlayers.length})**\n${formatList(allPlayers)}`);
        }

        if (commandName === '!cores') {
            const cores = allPlayers.filter(p => p.role === 'core');
            if (cores.length === 0) return message.channel.send(`⚠️ No core players found.`);
            return message.channel.send(`🔥 **Cores (${cores.length})**\n${formatList(cores)}`);
        }

        if (commandName === '!supports') {
            const supports = allPlayers.filter(p => p.role === 'support');
            if (supports.length === 0) return message.channel.send(`⚠️ No support players found.`);
            return message.channel.send(`🛡️ **Supports (${supports.length})**\n${formatList(supports)}`);
        }
    }
};