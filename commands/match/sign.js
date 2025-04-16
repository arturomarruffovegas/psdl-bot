const playerService = require('../../services/playerService');
const matchService = require('../../services/matchService');
const db = require('../../services/db');

module.exports = {
    name: '!sign',
    async execute(message, args) {
        const username = message.author.username.toLowerCase();
        const profile = await playerService.getPlayerProfileByUsername(username);
        if (!profile) return message.channel.send('❌ You are not registered.');

        const activeMatch = await matchService.getCurrentMatch();
        if (!activeMatch) {
            return message.channel.send('❌ No active match to sign up for.');
        }

        // Check if user is already in the pool.
        if (activeMatch.pool.includes(profile.id)) {
            return message.channel.send('⚠️ You are already signed up.');
        }

        const result = await matchService.signToPool(profile.id);
        if (typeof result === 'string') {
            // result could be a string error value (e.g., "no-match" or "already-signed")
            if (result === 'no-match') return message.channel.send('❌ No active match.');
            if (result === 'already-signed') return message.channel.send('⚠️ You are already signed up.');
        }
        if (result.status === 'ready') {
            // For start matches when pool reaches 10.
            const teams = result.teams;
            const formatTeam = (team) => team.map(id => `• \`${id}\``).join('\n');
            return message.channel.send(
                `🎮 **Match Ready!**\n` +
                `**Team Radiant:**\n${formatTeam(teams.radiant)}\n\n` +
                `**Team Dire:**\n${formatTeam(teams.dire)}`
            );
        } else {
            return message.channel.send(`✅ You have signed up. Current pool size: ${result.count}`);
        }
    }
};
