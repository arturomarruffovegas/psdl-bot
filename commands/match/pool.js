const playerService = require('../../services/playerService');
const matchService = require('../../services/matchService');

module.exports = {
    name: '!pool',
    async execute(message, args) {
        // Retrieve the unified active match (either challenge or start).
        const currentMatch = await matchService.getCurrentMatch();
        if (!currentMatch) {
            return message.channel.send('⚠️ No active match in progress.');
        }

        const pool = currentMatch.pool || [];
        if (pool.length === 0) {
            return message.channel.send('⚠️ No players have signed up yet.');
        }

        // Fetch all player profiles once so we can look up role & tier
        const allPlayers = await playerService.fetchAllPlayers();
        const poolDetails = pool.map(id => {
            const p = allPlayers.find(u => u.id === id);
            return p
                ? `• \`${p.id}\` — (${p.role.toUpperCase()} - T${p.tier})`
                : `• \`${id}\` — (Unknown)`;
        }).join('\n');

        let response = '';
        if (currentMatch.type === 'challenge') {
            response = `🧩 **Current Challenge Pool (${pool.length})**\n${poolDetails}`;
        } else if (currentMatch.type === 'start') {
            response = `🧩 **Current Start Match Pool (${pool.length}/10)**\n${poolDetails}`;
        } else {
            response = '⚠️ Active match has an unrecognized type.';
        }

        return message.channel.send(response);
    }
};