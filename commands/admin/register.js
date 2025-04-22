// commands/register.js
const playerService = require('../../services/playerService');

module.exports = {
  name: '!register',
  async execute(message, args) {
    // only users with the “Admin” role may run this
    const isAdmin = message.member.roles.cache.some(r => r.name === 'Admin');
    if (!isAdmin) {
      return message.channel.send('❌ You are not authorized to use this command.');
    }

    const fullMessage = message.content;
    const registerRegex = /^!register\s+(\S+)\s+(\S+)\s+"([^"]+)"\s+(\S+)\s+(\S+)\s+(core|support)\s+([1-5])$/i;
    const match = fullMessage.match(registerRegex);

    if (!match) {
      return message.channel.send(
        '❌ Invalid format.\n' +
        'Use: `!register <userId> <dotaId> "<Full Name>" <email> <discordTag> <core|support> <tier 1-5>`'
      );
    }

    const [, userId, dotaId, name, email, discordTag, role, tierStr] = match;
    const tier = parseInt(tierStr, 10);

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

      return message.channel.send(
        `✅ **${name}** registered as ${role.toUpperCase()} (T${tier}) with Discord tag \`${discordTag}\`.`
      );
    } catch (err) {
      console.error('[REGISTER] Error:', err);
      return message.channel.send('❌ Registration failed. Try again.');
    }
  }
};
