// commands/match/createteams.js
const teamPoolService = require('../../services/teamPoolService');

module.exports = {
  name: '!createteams',
  async execute(message) {
    // Only one infinite pool at a time
    const existing = await teamPoolService.getPool();
    if (existing) {
      return message.channel.send(
        '⚠️ A “create teams” pool is already open. Use `!abortteams` to cancel it first.'
      );
    }

    await teamPoolService.createPool();
    return message.channel.send(
      '✅ Team‑creation pool opened! Everyone can now `!sign` to join the pool.'
    );
  }
};