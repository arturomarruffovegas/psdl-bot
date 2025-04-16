const playerService = require('../../services/playerService');
const matchService = require('../../services/matchService');
const db = require('../../services/db');

// Read desired start‐match pool size from env, default to 10
const POOL_SIZE = process.env.START_POOL_SIZE
  ? parseInt(process.env.START_POOL_SIZE, 10)
  : 10;

module.exports = {
  name: '!start',
  async execute(message, args) {
    // 1) Lookup the user’s internal ID from their Discord username
    const discordName = message.author.username;
    const profile = await playerService.getPlayerProfileByUsername(discordName);
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }
    const userId = profile.id;  // e.g. "novadota"

    // 2) Ensure no challenge match is currently running
    const challengeDoc = await db.collection('challenges').doc('current').get();
    if (challengeDoc.exists) {
      return message.channel.send(
        '⚠️ A challenge match is currently active. Cannot start a new start match.'
      );
    }

    // 3) Ensure no unified match (challenge or start) is active
    const activeMatch = await matchService.getCurrentMatch();
    if (activeMatch) {
      return message.channel.send(
        '⚠️ A match is already in progress. Use `!abort` to cancel it before starting a new one.'
      );
    }

    // 4) Create the start match, auto‐signing the initiator
    const result = await matchService.createMatch('start', userId);
    if (!result) {
      return message.channel.send('❌ Unable to create a start match.');
    }

    // 5) Confirm creation and show dynamic pool count
    return message.channel.send(
      `✅ Start match created! You are signed up. Pool: 1/${POOL_SIZE}`
    );
  }
};