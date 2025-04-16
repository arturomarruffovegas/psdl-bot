const playerService = require('../../services/playerService');
const matchService  = require('../../services/matchService');

module.exports = {
  name: '!unsign',
  async execute(message) {
    // Lookup
    const discordName = message.author.username.toLowerCase();
    const profile     = await playerService.getPlayerProfileByUsername(discordName);
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }

    // Attempt to leave
    const result = await matchService.removeFromPool(profile.id);
    if (result === 'no-match')        return message.channel.send('❌ No active match.');
    if (result === 'not-signed')      return message.channel.send('⚠️ You are not signed up.');
    if (result === 'picking-started') return message.channel.send('⚠️ Cannot leave after picks have started.');
    if (result === 'match-ready')     return message.channel.send('⚠️ Cannot leave a match that is already ready.');
    // success
    return message.channel.send('✅ You have left the pool.');
  }
};