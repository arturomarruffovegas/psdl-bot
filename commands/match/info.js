const { EmbedBuilder } = require('discord.js');
const db = require('../../services/db');

module.exports = {
  name: '!info',
  async execute(message, args) {
    if (args.length !== 1) {
      return message.channel.send('❌ Usage: `!info <matchId>`');
    }
    const matchId = args[0].trim();

    // 1) Try the ephemeral/current collection
    let snap = await db.collection('matches').doc(matchId).get();
    if (!snap.exists) {
      // 2) Fallback to the finalizedMatches archive
      snap = await db.collection('finalizedMatches').doc(matchId).get();
    }
    if (!snap.exists) {
      return message.channel.send(`❌ Match \`${matchId}\` not found.`);
    }

    const data = snap.data();
    // timestamp: use createdAt (archive) or startedAt (if still lingering)
    const ts = data.createdAt || data.startedAt;
    const playedAtText = ts
      ? `<t:${Math.floor(new Date(ts).getTime() / 1000)}:F>`
      : 'Unknown';

    const winnerText = data.winner
      ? `\`${data.winner.toUpperCase()}\``
      : 'Pending Result';

    // Helper: format each side for the embed field
    const formatTeam = (teamObj) => {
      const lines = [];
      if (teamObj.captain) {
        lines.push(`👑 \`${teamObj.captain}\``);
      }
      const players = Array.isArray(teamObj.players) ? teamObj.players : [];
      for (const p of players) {
        lines.push(`• \`${p}\``);
      }
      return lines.length ? lines.join('\n') : 'No players listed';
    };

    // build embed
    const embed = new EmbedBuilder()
      .setTitle(`📜 Match \`${matchId}\``)
      .setColor(0xFFA500)
      .addFields(
        { name: '🕓 Played at', value: playedAtText, inline: true },
        { name: '🏆 Winner',    value: winnerText,   inline: true },
        // blank spacer
        { name: '\u200B',       value: '\u200B' },
        // Radiant field
        { name: '🟢 Radiant', value: data.radiant ? formatTeam(data.radiant) : '—', inline: true },
        // Dire field
        { name: '🔴 Dire',    value: data.dire    ? formatTeam(data.dire)    : '—', inline: true }
      )
      .setTimestamp();

    return message.channel.send({ embeds: [embed] });
  }
};