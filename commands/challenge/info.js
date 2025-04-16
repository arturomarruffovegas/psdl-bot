const db = require('../../services/db');

module.exports = {
    name: '!results',
    async execute(message, args) {
        if (args.length !== 1) {
            return message.channel.send('❌ Usage: `!results <matchId>`');
        }

        const matchId = args[0];
        const matchRef = await db.collection('matches').doc(matchId).get();

        if (!matchRef.exists) {
            return message.channel.send(`❌ Match \`${matchId}\` not found.`);
        }

        const match = matchRef.data();

        if (!match.radiant || !match.dire) {
            return message.channel.send(`⚠️ Match \`${matchId}\` is missing team data.`);
        }

        const formatTeam = (team, name) => {
            const players = Array.isArray(team.players)
                ? team.players.map(p => `• \`${p}\``).join('\n')
                : '_No players listed_';

            return `**${name}** 👑 \`${team.captain}\`\n${players}`;
        };

        const playedAtUnix = match.createdAt
            ? Math.floor(new Date(match.createdAt).getTime() / 1000)
            : null;

        return message.channel.send(
            `📜 **Match \`${matchId}\`**\n` +
            `🕓 Played at: ${playedAtUnix ? `<t:${playedAtUnix}:F>` : 'Unknown'}\n\n` +
            `🏆 **Winner**: ${match.winner ? `\`${match.winner.toUpperCase()}\`` : '`Pending Result`'}\n` +
            `${formatTeam(match.radiant, 'Radiant Team')}\n\n` +
            `${formatTeam(match.dire, 'Dire Team')}`
        );
    }
};
