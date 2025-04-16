const playerService = require('../../services/playerService');
const challengeService = require('../../services/challengeService');
const db = require('../../services/db');

module.exports = {
    name: ['!sign', '!pool'],
    async execute(message, args, commandName) {
        const user = await playerService.getPlayerProfileByUsername(message.author.username);

        if (!user && commandName === '!sign') {
            return message.channel.send('❌ You are not registered.');
        }

        if (commandName === '!sign') {
            const current = await db.collection('challenges').doc('current').get();

            if (current.exists) {
                const { captain1, captain2 } = current.data();
                if ([captain1, captain2].includes(user.id)) {
                    return message.channel.send('❌ Captains cannot sign into the player pool.');
                }
            }

            const result = await challengeService.signToPool(user.id);

            if (result === 'no-challenge') return message.channel.send('❌ No active challenge.');
            if (result === 'already-signed') return message.channel.send('⚠️ You are already signed up.');
            if (result === 'already-in-game') return message.channel.send(`❌ You are already in a match that hasn't been resolved.`);

            return message.channel.send(`✅ \`${user.id}\` joined the challenge pool.`);
        }

        if (commandName === '!pool') {
            const pool = await challengeService.getCurrentPool();
            if (pool.length === 0) return message.channel.send('⚠️ No players have signed up yet.');

            const allPlayers = await playerService.fetchAllPlayers();
            const poolDetails = pool.map(id => {
                const p = allPlayers.find(u => u.id === id);
                return p
                    ? `• \`${p.id}\` (${p.role.toUpperCase()} - T${p.tier})`
                    : `• \`${id}\` (Unknown)`;
            });

            return message.channel.send(`🧩 **Current Pool (${pool.length})**\n${poolDetails.join('\n')}`);
        }
    }
};