const playerService = require('../../services/playerService');
const matchService = require('../../services/matchService');
const db = require('../../services/db');

module.exports = {
    name: '!result',
    async execute(message, args) {
        if (args.length !== 1) {
            return message.channel.send('❌ Usage: `!result <radiant|dire>`');
        }
        const resultTeam = args[0].toLowerCase();
        if (!['radiant', 'dire'].includes(resultTeam)) {
            return message.channel.send('❌ Invalid team. Use `radiant` or `dire`.');
        }

        const username = message.author.username.toLowerCase();
        const profile = await playerService.getPlayerProfileByUsername(username);
        if (!profile) return message.channel.send('❌ You are not registered.');

        const match = await matchService.getCurrentMatch();
        if (!match) {
            return message.channel.send('❌ No active match to report.');
        }

        if (match.type === 'challenge') {
            // In challenge matches, only captains can report.
            if (![match.captain1, match.captain2].includes(profile.id)) {
                return message.channel.send('❌ Only captains can report match results.');
            }
            const res = await matchService.submitResult(profile.id, profile.id, resultTeam);
            if (res.error) {
                return message.channel.send(`❌ Error: ${res.error}`);
            }
            return message.channel.send(
                `🏆 Match result recorded: **${resultTeam.toUpperCase()}** wins!\n` +
                `Challenge closed.\nMatch ID: \`${res.matchId || 'N/A'}\`\n` +
                `Review with \`!info <matchId>\``
            );
        } else if (match.type === 'start') {
            // In start matches, any signed player can vote.
            const res = await matchService.submitResult(profile.id, profile.id, resultTeam);
            if (res.error) {
                if (res.error === 'invalid-team') return message.channel.send('❌ Invalid team specified.');
                if (res.error === 'no-match') return message.channel.send('❌ No active start match.');
                if (res.error === 'match-not-ready') return message.channel.send('⚠️ The match is not ready yet.');
                if (res.error === 'already-voted') return message.channel.send('⚠️ You have already voted.');
                return message.channel.send('❌ An error occurred while submitting your vote.');
            }
            if (res.status === 'pending') {
                return message.channel.send(`✅ Vote recorded for **${resultTeam.toUpperCase()}**. Current votes: ${JSON.stringify(res.votes)}`);
            }
            if (res.status === 'finalized') {
                return message.channel.send(
                    `🏆 Match result finalized: **${res.winner.toUpperCase()}** wins!\n` +
                    `Lobby: \`${res.match.lobbyName}\`\nPassword: \`${res.match.password}\``
                );
            }
        }
    }
};
