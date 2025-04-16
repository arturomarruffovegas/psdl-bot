// commands/match/info.js
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
    // createdAt for archived, or startedAt for a lingering current
    const ts = data.createdAt || data.startedAt;
    const playedAtText = ts
      ? `<t:${Math.floor(new Date(ts).getTime() / 1000)}:F>`
      : 'Unknown';

    const winnerText = data.winner
      ? `\`${data.winner.toUpperCase()}\``
      : 'Pending Result';

    // Helper to format either challenge or start‐style teams
    const formatTeam = (teamObj, label) => {
      const lines = [];
      if (teamObj.captain) {
        lines.push(`Captain: \`${teamObj.captain}\``);
      }
      const players = Array.isArray(teamObj.players) ? teamObj.players : [];
      lines.push('Players:');
      if (players.length) {
        for (const p of players) {
          lines.push(`• \`${p}\``);
        }
      } else {
        lines.push('No players listed');
      }
      return `**${label} Team**\n${lines.join('\n')}`;
    };

    const radiantSection = data.radiant
      ? formatTeam(data.radiant, 'Radiant')
      : '⚠️ Radiant team data missing';
    const direSection    = data.dire
      ? formatTeam(data.dire, 'Dire')
      : '⚠️ Dire team data missing';

    // Show lobby/password if they exist
    const lobbyLine = data.lobbyName ? `🧩 Lobby: \`${data.lobbyName}\`` : '';
    const passLine  = data.password  ? `🔐 Password: \`${data.password}\`` : '';

    const out = [
      `📜 **Match \`${matchId}\`**`,
      `🕓 Played at: ${playedAtText}`,
      `🏆 Winner: ${winnerText}`,
      '',
      radiantSection,
      '',
      direSection,
      lobbyLine && '',
      lobbyLine,
      passLine
    ]
      .filter(Boolean)
      .join('\n');

    return message.channel.send(out);
  }
};
