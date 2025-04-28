// commands/profile.js
const playerService = require('../services/playerService');

module.exports = {
    name: '!profile',
    async execute(message, args) {
        let player;
        let heading;

        // 1) Determine which profile to fetch
        if (args.length === 1) {
            const userId = args[0].toLowerCase();
            player = await playerService.getPlayerProfileById(userId);
            if (!player) {
                return message.channel.send(`❌ No player found with ID \`${userId}\`.`);
            }
            heading = `🧾 Profile for \`${userId}\``;
        } else {
            // Self-profile
            player = await playerService.getPlayerProfileByUsername(
                message.author.username.toLowerCase()
            );
            if (!player) {
                return message.channel.send('❌ You are not registered.');
            }
            heading = '🧾 Your Profile';
        }

        // 2) Build profile message
        const profileMsg =
            `${heading}\n` +
            `• **User ID**: \`${player.id}\`\n` +
            `• **Discord Tag**: ${player.discordTag ?? 'N/A'}\n` +
            `• **Dota ID**: ${player.dotaId}\n` +
            `• **Role**: ${player.role.toUpperCase()}\n` +
            `• **Tier**: T${player.tier}\n` +
            `• **Points**: ${player.points ?? 0}\n` +
            `• **Since**: <t:${Math.floor(new Date(player.registeredAt).getTime() / 1000)}:F>`;

        // 3) DM the profile to the requester
        try {
            await message.author.send(profileMsg);
            // Public acknowledgement if not in DM channel
            if (message.channel.type !== 'DM') {
                return message.channel.send("📬 I've sent you your profile in a DM.");
            }
        } catch (err) {
            console.error('[PROFILE] DM failed:', err);
            return message.channel.send(
                '❌ I couldn\'t send you a DM. Do you have DMs disabled?'
            );
        }
    }
};