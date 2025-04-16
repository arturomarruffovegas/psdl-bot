// commands/match/split.js
const teamPoolService = require('../../services/teamPoolService');

module.exports = {
  name: '!split',
  async execute(message, args) {
    const num = parseInt(args[0], 10);
    if (!num || num < 1) {
      return message.channel.send('❌ Usage: `!split <numberOfTeams>`');
    }

    const res = await teamPoolService.splitTeams(num);
    if (res.error === 'no-pool') {
      return message.channel.send('⚠️ No active pool. Start one with `!createteams`.');
    }
    if (res.error === 'not-enough') {
      return message.channel.send(
        `⚠️ Need ${res.needed} players to make ${num} teams, but only ${res.count} signed.`
      );
    }

    // Show each team
    let out = `🎮 **${num} Teams** (5 players each)\n\n`;
    res.teams.forEach((team, i) => {
      out += `**Team ${i+1}**\n` +
             team.map(id => `• \`${id}\``).join('\n') +
             '\n\n';
    });
    return message.channel.send(out.trim());
  }
};
