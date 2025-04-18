// commands/match/info.js
const { EmbedBuilder } = require('discord.js');
const db = require('../../services/db');

module.exports = {
  name: '!info',
  async execute(message, args) {
    if (args.length !== 1) {
      return message.channel.send('❌ Usage: `!info <matchId>`');
    }
    const matchId = args[0].trim();

    // 1) Try the pregame matches/current
    let snap = await db.collection('matches').doc(matchId).get();
    let source = 'current';

    // 2) Fallback to ongoingMatches
    if (!snap.exists) {
      snap = await db.collection('ongoingMatches').doc(matchId).get();
      source = snap.exists ? 'ongoing' : source;
    }

    // 3) Fallback to the finalizedMatches archive
    if (!snap.exists) {
      snap = await db.collection('finalizedMatches').doc(matchId).get();
      source = snap.exists ? 'finalized' : source;
    }

    if (!snap.exists) {
      return message.channel.send(`❌ Match \`${matchId}\` not found.`);
    }

    const data = snap.data();
    // timestamp: use createdAt or startedAt
    const ts = data.createdAt || data.startedAt;
    const playedAtText = ts
      ? `<t:${Math.floor(new Date(ts).getTime() / 1000)}:F>`
      : 'Unknown';

    const winnerText = data.winner
      ? `\`${data.winner.toUpperCase()}\``
      : 'Pending Result';

    // Helper: format each side
    const formatTeam = (teamObj) => {
      const lines = [];
      if (teamObj.captain) {
        lines.push(`👑 \`${teamObj.captain}\``);
      }
      const players = Array.isArray(teamObj.players)
        ? teamObj.players
        : [];
      for (const p of players) {
        lines.push(`• \`${p}\``);
      }
      return lines.length ? lines.join('\n') : 'No players listed';
    };

    // Build embed
    const embed = new EmbedBuilder()
      .setTitle(`📜 Match \`${matchId}\``)
      .setColor(0xFFA500)
      .addFields(
        { name: '🔖 Source',    value: source,           inline: true },
        { name: '🕓 Played at',  value: playedAtText,    inline: true },
        { name: '🏆 Winner',     value: winnerText,      inline: true },
        { name: '\u200B',       value: '\u200B',      inline: false },
        { name: '🟢 Radiant',    value: formatTeam(data.radiant || data.teams?.radiant), inline: true },
        { name: '🔴 Dire',       value: formatTeam(data.dire    || data.teams?.dire),    inline: true }
      )
      .setTimestamp();

    return message.channel.send({ embeds: [embed] });
  }
};
