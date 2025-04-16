const playerService = require('../../services/playerService');
const challengeService = require('../../services/challengeService');
const db = require('../../services/db');

module.exports = {
    name: '!pick',
    async execute(message, args) {
        if (args.length !== 1) {
            return message.channel.send('❌ Usage: `!pick <userId>`');
        }

        const pickId = args[0].trim();
        const user = await playerService.getPlayerProfileByUsername(message.author.username);
        if (!user) return message.channel.send('❌ You are not registered.');

        const result = await challengeService.pickPlayer(user.id, pickId);

        if (result.error === 'no-challenge') return message.channel.send('❌ No active challenge.');
        if (result.error === 'not-captain') return message.channel.send('❌ Only captains can pick players.');
        if (result.error === 'not-your-turn') return message.channel.send('⚠️ It is not your turn to pick.');
        if (result.error === 'not-in-pool') return message.channel.send('⚠️ That player is not in the pool.');

        const summary = `✅ \`${pickId}\` has been picked for the **${result.team} Team**.`;

        // 🎮 Finalized match
        if (result.finalized) {
            const snapshot = await db.collection('challenges').doc('current').get();
            const picks = snapshot.data().picks;

            const formatTeam = (players, label, captainId) => {
                return `**${label} Team**\n` +
                    [captainId, ...players].map(id => {
                        const tag = id === captainId ? ' 👑' : '';
                        return `• \`${id}\`${tag}`;
                    }).join('\n');
            };

            return message.channel.send(
                `${summary}\n\n🎮 **Match Ready!**\n` +
                `🟢 ${formatTeam(picks.radiant, 'Radiant', snapshot.data().captain1)}\n\n` +
                `🔴 ${formatTeam(picks.dire, 'Dire', snapshot.data().captain2)}\n\n` +
                `🧩 Lobby: \`${result.finalized.lobbyName}\`\n` +
                `🔐 Password: \`${result.finalized.password}\`\n\n` +
                `Captains must report result using \`!result radiant\` or \`!result dire\`.`
            );
        }

        // 🟢 Regular pick
        const ref = db.collection('challenges').doc('current');
        const snapshot = await ref.get();
        const data = snapshot.data();
        const nextCaptain = result.team === 'Radiant' ? data.captain2 : data.captain1;

        return message.channel.send(`${summary}\n🎯 **${nextCaptain}**, it's your turn to pick.`);
    }
};