const playerService = require('../services/playerService');

module.exports = {
    name: '!profile',
    async execute(message, args) {
        let player;

        if (args.length === 1) {
            const userId = args[0].toLowerCase();
            player = await playerService.getPlayerProfileById(userId);
            if (!player) {
                return message.channel.send(`❌ No player found with ID \`${userId}\`.`);
            }

            return message.channel.send(
                `🧾 **Profile for \`${userId}\`**\n` +
                // `• **Name**: ${player.name}\n` +
                // `• **Email**: ${player.email}\n` +
                `• **Discord Tag**: ${player.discordTag ?? 'N/A'}\n` +
                `• **Dota ID**: ${player.dotaId}\n` +
                `• **Role**: ${player.role.toUpperCase()}\n` +
                `• **Tier**: T${player.tier}\n` +
                `• **Points**: ${player.points ?? 0}\n` +
                `• **Since**: <t:${Math.floor(new Date(player.registeredAt).getTime() / 1000)}:F>`
            );
        }

        player = await playerService.getPlayerProfileByUsername(message.author.username);
        if (!player) {
            return message.channel.send(`❌ You are not registered.`);
        }

        return message.channel.send(
            `🧾 **Your Profile**\n` +
            `• **Name**: ${player.name}\n` +
            `• **Email**: ${player.email}\n` +
            `• **User ID**: \`${player.id}\`\n` +
            `• **Dota ID**: ${player.dotaId}\n` +
            `• **Role**: ${player.role.toUpperCase()}\n` +
            `• **Tier**: T${player.tier}\n` +
            `• **Points**: ${player.points ?? 0}\n` +
            `• **Since**: <t:${Math.floor(new Date(player.registeredAt).getTime() / 1000)}:F>`
        );
    }
};