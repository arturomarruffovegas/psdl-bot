const playerService = require('../../services/playerService');
const matchService = require('../../services/matchService');
const db = require('../../services/db');

module.exports = {
  name: '!start',
  async execute(message, args) {
    // First, look up the player by their Discord username:
    const discordName = message.author.username;
    const profile = await playerService.getPlayerProfileByUsername(discordName);
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }
    const userId = profile.id;  // this is "novadota", etc.

    // Make sure no challenge match is active
    const challengeDoc = await db.collection('challenges').doc('current').get();
    if (challengeDoc.exists) {
      return message.channel.send('⚠️ A challenge match is currently active. Cannot start a start match.');
    }

    // Make sure no unified match is active
    const activeMatch = await matchService.getCurrentMatch();
    if (activeMatch) {
      return message.channel.send('⚠️ A match is already in progress. Use `!abort` to cancel it.');
    }

    // Create the start match using the internal userId
    const result = await matchService.createMatch('start', userId);
    if (!result) {
      return message.channel.send('❌ Unable to create a start match.');
    }
    
    return message.channel.send(`✅ Start match created! You are signed up. Pool: 1/10`);
  }
};
