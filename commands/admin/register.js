const playerService = require('../../services/playerService');
const ADMIN_IDS = process.env.ADMIN_IDS.split(',');

module.exports = {
    name: '!register',
    async execute(message, args) {
        if (!ADMIN_IDS.includes(message.author.id)) {
            return message.channel.send('❌ You are not authorized to use this command.');
        }

        const fullMessage = message.content;
        const registerRegex = /^!register\s+(\S+)\s+(\S+)\s+"([^"]+)"\s+(\S+)\s+(\S+)\s+(core|support)\s+([1-5])$/i;
        const match = fullMessage.match(registerRegex);

        if (!match) {
            return message.channel.send(`❌ Invalid format.\nUse: \`!register <userId> <dotaId> "<Full Name>" <email> <discordTag> <core|support> <tier 1-5>\``);
        }

        const [, userId, dotaId, name, email, discordTag, role, tierStr] = match;
        const tier = parseInt(tierStr);

        try {
            const success = await playerService.registerPlayer(userId, {
                registeredBy: message.author.username,
                userId,
                dotaId,
                name,
                email,
                discordTag,
                role: role.toLowerCase(),
                tier,
                points: 1000,
                active: true
            });

            if (!success) {
                return message.channel.send(`❌ That userId already exists. Choose a unique one.`);
            }

            return message.channel.send(`✅ **${name}** registered as ${role.toUpperCase()} (T${tier}) with Discord tag \`${discordTag}\`.`);
        } catch (err) {
            console.error('[REGISTER] Error:', err);
            return message.channel.send('❌ Registration failed. Try again.');
        }
    }
};