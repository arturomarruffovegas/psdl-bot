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

        let response = '';
        if (currentMatch.type === 'challenge') {
            // For challenge matches, show detailed info from player records.
            const allPlayers = await playerService.fetchAllPlayers();
            const poolDetails = pool.map(id => {
                const p = allPlayers.find(u => u.id === id);
                return p
                    ? `• \`${p.id}\` (${p.role.toUpperCase()} - T${p.tier})`
                    : `• \`${id}\` (Unknown)`;
            });
            response = `🧩 **Current Challenge Pool (${pool.length})**\n${poolDetails.join('\n')}`;
        } else if (currentMatch.type === 'start') {
            // For start matches, simply list the signed-in IDs and show the cap.
            response = `🧩 **Current Start Match Pool (${pool.length}/10)**\n` +
                pool.map(id => `• \`${id}\``).join('\n');
        } else {
            response = '⚠️ Active match has an unrecognized type.';
        }

        return message.channel.send(response);
    }
};