// commands/match/abort.js
const matchService  = require('../../services/matchService');
const playerService = require('../../services/playerService');

module.exports = {
  name: '!abort',
  async execute(message) {
    // 1) lookup internal userId (if registered)
    const profile = await playerService.getPlayerProfileByUsername(
      message.author.username.toLowerCase()
    );
    const userId = profile ? profile.id : null;

    // 2) Admin check via Discord role
    const isAdmin = message.member.roles.cache.some(r => r.name === 'Admin');

    // 3) Fetch the active unified match
    const match = await matchService.getCurrentMatch();
    if (!match) {
      return message.channel.send('⚠️ No active match to abort.');
    }

    // 4) Permission checks if not admin
    if (!isAdmin) {
      if (match.type === 'challenge') {
        // only the challenger (captain1) may abort a challenge
        if (userId !== match.captain1) {
          return message.channel.send('❌ Only the challenger can abort this challenge.');
        }
      } else if (match.type === 'start') {
        // only the match starter may abort a start match
        if (userId !== match.starter) {
          return message.channel.send('❌ Only the match starter can abort this start match.');
        }
      } else {
        // unknown type
        return message.channel.send('⚠️ Cannot abort this type of match.');
      }
    }

    // 5) Actually abort
    const success = await matchService.abortMatch();
    if (!success) {
      return message.channel.send('⚠️ No active match to abort.');
    }
    return message.channel.send('🛑 The current match has been **aborted**.');
  }
};
