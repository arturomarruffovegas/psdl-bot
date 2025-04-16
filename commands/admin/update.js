const playerService = require('../../services/playerService');
const ADMIN_IDS = process.env.ADMIN_IDS.split(',');

module.exports = {
    name: '!update',
    async execute(message, args) {
        if (!ADMIN_IDS.includes(message.author.id)) {
            return message.channel.send('❌ You are not authorized to use this command.');
        }

        if (args.length !== 3) {
            return message.channel.send(`❌ Usage: \`!update <userId> <field> <value>\``);
        }

        const [userId, field, rawValue] = args;
        const validFields = ['name', 'email', 'role', 'tier', 'points'];

        if (!validFields.includes(field)) {
            return message.channel.send(`❌ Invalid field. Use one of: \`${validFields.join(', ')}\``);
        }

        const value = ['tier', 'points'].includes(field) ? parseInt(rawValue) : rawValue;
        const updates = { [field]: value };

        try {
            await playerService.updatePlayer(userId, updates);
            return message.channel.send(`✅ Updated \`${userId}\` → \`${field}\` to \`${value}\`.`);
        } catch (err) {
            console.error('[UPDATE] Failed:', err);
            return message.channel.send(`❌ Failed to update user.`);
        }
    }
};
