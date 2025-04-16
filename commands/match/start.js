const matchService = require('../../services/matchService');
const db = require('../../services/db');

module.exports = {
  name: '!start',
  async execute(message, args) {
    // Use lower-case username as stored in your database.
    const username = message.author.username.toLowerCase();

    // Ensure no active challenge match exists.
    const challengeDoc = await db.collection('challenges').doc('current').get();
    if (challengeDoc.exists) {
      return message.channel.send('⚠️ A challenge match is currently active. Cannot start a start match.');
    }

    // Ensure no active unified match exists.
    const activeMatch = await matchService.getCurrentMatch();
    if (activeMatch) {
      return message.channel.send('⚠️ A match is already in progress. Use `!abort` to cancel it.');
    }

    const result = await matchService.createMatch('start', username);
    if (!result) {
      return message.channel.send('❌ Unable to create a start match.');
    }
    return message.channel.send(`✅ Start match created! You are signed up. Pool: 1/10`);
  }
};
