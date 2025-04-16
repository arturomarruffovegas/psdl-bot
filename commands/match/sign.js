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

        // Handle string error codes
        if (typeof result === 'string') {
            if (result === 'no-match') return message.channel.send('❌ No active match.');
            if (result === 'already-signed') return message.channel.send('⚠️ You are already signed up.');
            if (result === 'pool-full')    return message.channel.send('⚠️ The start match pool is already full.');
            if (result === 'pool-error')   return message.channel.send('❌ An error occurred finalizing the pool.');
        }

        // If pool isn't full yet, just show the count
        if (result.status !== 'ready') {
            return message.channel.send(`✅ You have signed up. Current pool size: ${result.count}/10`);
        }

        // === START MATCH FINALIZED ===
        // result.status === 'ready'
        // result.teams  -> { radiant: [...], dire: [...] }
        // result.finalized -> { lobbyName, password }
        const { teams, finalized } = result;

        const formatTeam = team =>
            team.map(id => `• \`${id}\``).join('\n');

        // Wrap lobby info in spoiler tags so viewers must click to reveal
        const lobbySpoiler    = `||\`${finalized.lobbyName}\`||`;
        const passwordSpoiler = `||\`${finalized.password}\`||`;

        return message.channel.send(
            `🎮 **Match Ready!**\n\n` +
            `**Team Radiant:**\n${formatTeam(teams.radiant)}\n\n` +
            `**Team Dire:**\n${formatTeam(teams.dire)}\n\n` +
            `🧩 Lobby: ${lobbySpoiler}\n` +
            `🔐 Password: ${passwordSpoiler}\n\n` +
            `Captains, report the result with \`!result radiant\` or \`!result dire\`.`
        );
    }
};
