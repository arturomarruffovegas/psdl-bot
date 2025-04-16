const db = require('../../services/db');

module.exports = {
    name: '!info',
    async execute(message, args) {
        if (args.length !== 1) {
            return message.channel.send('❌ Usage: `!info <matchId>`');
        }

        const matchId = args[0].trim();
        const matchDoc = await db.collection('matches').doc(matchId).get();
        if (!matchDoc.exists) {
            return message.channel.send(`❌ Match \`${matchId}\` not found.`);
        }

        const match = matchDoc.data();

        // Format timestamp for display in Discord using the <t:unix:F> format.
        const playedAtUnix = match.createdAt ? Math.floor(new Date(match.createdAt).getTime() / 1000) : null;
        const playedAtText = playedAtUnix ? `<t:${playedAtUnix}:F>` : 'Unknown';

        // Determine winner
        const winnerText = match.winner ? `\`${match.winner.toUpperCase()}\`` : 'Pending Result';

        // Format team details.
        const formatTeam = (team, label) => {
            const captainLine = `Captain: \`${team.captain}\``;
            const players = Array.isArray(team.players) && team.players.length > 0 
                ? team.players.map(p => `• \`${p}\``).join('\n')
                : 'No players listed';
            return `**${label} Team**\n${captainLine}\nPlayers:\n${players}`;
        };

        const radiantTeamInfo = formatTeam(match.radiant, 'Radiant');
        const direTeamInfo = formatTeam(match.dire, 'Dire');

        const infoMessage =
            `📜 **Match \`${matchId}\`**\n` +
            `🕓 Played at: ${playedAtText}\n` +
            `🏆 Winner: ${winnerText}\n\n` +
            `${radiantTeamInfo}\n\n` +
            `${direTeamInfo}`;

        return message.channel.send(infoMessage);
    }
};
