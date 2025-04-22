// commands/adminUser.js
const playerService = require('../../services/playerService');

module.exports = {
    name: ['!unregister', '!activate', '!deactivate'],
    async execute(message, args, commandName) {
        // only users with the “Admin” role may run this
        const isAdmin = message.member.roles.cache.some(r => r.name === 'Admin');
        if (!isAdmin) {
            return message.channel.send('❌ You are not authorized to use this command.');
        }

        if (args.length !== 1) {
            return message.channel.send(`❌ Usage: \`${commandName} <userId>\``);
        }

        const userId = args[0];
        try {
            if (commandName === '!unregister') {
                await playerService.unregisterPlayer(userId);
                return message.channel.send(`🗑️ Player \`${userId}\` removed from the database.`);
            }

            if (commandName === '!activate') {
                await playerService.updatePlayer(userId, { active: true });
                return message.channel.send(`✅ \`${userId}\` marked as **active**.`);
            }

            if (commandName === '!deactivate') {
                await playerService.updatePlayer(userId, { active: false });
                return message.channel.send(`⚠️ \`${userId}\` marked as **inactive**.`);
            }

            return message.channel.send('⚠️ Unknown command.');
        } catch (err) {
            console.error(`[${commandName.toUpperCase()}] Failed for user:`, userId, err);
            return message.channel.send('❌ Failed to update user.');
        }
    }
};
