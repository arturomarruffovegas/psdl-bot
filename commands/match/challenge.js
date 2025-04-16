const playerService = require('../../services/playerService');
const matchService = require('../../services/matchService');
const db = require('../../services/db');

module.exports = {
  name: '!challenge',
  async execute(message, args) {
    if (args.length !== 1) {
      return message.channel.send('❌ Usage: `!challenge <userId>`');
    }

    const challengedId = args[0].trim();
    // Use lower-case username as stored in your database.
    const challengerProfile = await playerService.getPlayerProfileByUsername(message.author.username);
    const challengedProfile = await playerService.getPlayerProfileById(challengedId);

    if (!challengerProfile || !challengedProfile) {
      return message.channel.send('❌ Both you and the challenged player must be registered.');
    }

    if (challengerProfile.id === challengedProfile.id) {
      return message.channel.send('❌ You cannot challenge yourself.');
    }

    // Before creating a challenge, ensure no other active match exists.
    const activeMatch = await matchService.getCurrentMatch();
    if (activeMatch) {
      return message.channel.send('⚠️ A match is already in progress. Use `!abort` to cancel it.');
    }

    try {
      const result = await matchService.createMatch('challenge', challengerProfile.id, challengedProfile.id);
      if (!result) {
        return message.channel.send('⚠️ A match is already in progress. Use `!abort` to cancel it.');
      }
      return message.channel.send(
        `⚔️ **${challengerProfile.id}** has challenged **${challengedProfile.id}**!\n` +
        `👉 **${challengedProfile.id}**, type \`!accept\` to begin or \`!reject\` to cancel.`
      );
    } catch (err) {
      console.error('[CHALLENGE] Failed to create challenge:', err);
      return message.channel.send('❌ An error occurred while creating the challenge.');
    }
  }
};
