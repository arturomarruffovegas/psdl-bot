// commands/update.js
const playerService = require('../../services/playerService');

module.exports = {
  name: '!update',
  async execute(message, args) {
    // only users with the “Admin” role may run this
    const isAdmin = message.member.roles.cache.some(r => r.name === 'Admin');
    if (!isAdmin) {
      return message.channel.send('❌ You are not authorized to use this command.');
    }

    if (args.length !== 3) {
      return message.channel.send('❌ Usage: `!update <userId> <field> <value>`');
    }

    const [userId, field, rawValue] = args;
    const validFields = ['name', 'email', 'role', 'tier', 'points'];
    if (!validFields.includes(field)) {
      return message.channel.send(`❌ Invalid field. Use one of: \`${validFields.join(', ')}\`.`);
    }

    const value = ['tier', 'points'].includes(field) ? parseInt(rawValue, 10) : rawValue;
    try {
      await playerService.updatePlayer(userId, { [field]: value });
      return message.channel.send(`✅ Updated \`${userId}\` → \`${field}\` to \`${value}\`.`);
    } catch (err) {
      console.error('[UPDATE] Failed:', err);
      return message.channel.send('❌ Failed to update user.');
    }
  }
};