const playerService = require('../../services/playerService');
const matchService = require('../../services/matchService');
const db = require('../../services/db');

// Read desired start‐match pool size from env, default to 10
const POOL_SIZE = process.env.START_POOL_SIZE
    ? parseInt(process.env.START_POOL_SIZE, 10)
    : 10;

module.exports = {
    name: '!sign',
    async execute(message, args) {
        // 1) Lookup the user’s internal ID from their Discord username
        const discordName = message.author.username.toLowerCase();
        const profile = await playerService.getPlayerProfileByUsername(discordName);
        if (!profile) {
            return message.channel.send('❌ You are not registered.');
        }
        const userId = profile.id;

        // 2) Fetch the currently active match (challenge or start)
        const activeMatch = await matchService.getCurrentMatch();
        if (!activeMatch) {
            return message.channel.send('❌ No active match to sign up for.');
        }

        // 3) Prevent duplicate sign‑ups
        if (activeMatch.pool.includes(userId)) {
            return message.channel.send('⚠️ You are already signed up.');
        }

        // 4) Attempt to sign into the pool
        const result = await matchService.signToPool(userId);

        // 5) Handle string error codes
        if (typeof result === 'string') {
            if (result === 'no-match') return message.channel.send('❌ No active match.');
            if (result === 'already-signed') return message.channel.send('⚠️ You are already signed up.');
            if (result === 'pool-full') return message.channel.send('⚠️ The start match pool is already full.');
            if (result === 'pool-error') return message.channel.send('❌ An error occurred finalizing the pool.');
        }

        // 6) If not yet full, show dynamic pool count
        if (result.status !== 'ready') {
            return message.channel.send(
                `✅ You have signed up. Current pool size: ${result.count}/${POOL_SIZE}`
            );
        }

        // 7) START MATCH FINALIZED
        //    result.status === 'ready'
        //    result.teams     -> { radiant: [...], dire: [...] }
        //    result.finalized -> { lobbyName, password }
        const { teams, finalized } = result;

        const formatTeam = team =>
            team.map(id => `• \`${id}\``).join('\n');

        // Wrap lobby info in spoiler tags so viewers must click to reveal
        const lobbySpoiler = `||\`${finalized.lobbyName}\`||`;
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
