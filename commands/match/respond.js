const playerService = require('../../services/playerService');
const db = require('../../services/db');

module.exports = {
    name: ['!accept', '!reject'],
    async execute(message, args, commandName) {
        const username = message.author.username.toLowerCase();
        const profile = await playerService.getPlayerProfileByUsername(username);
        if (!profile) return message.channel.send('❌ You are not registered.');

        const ref = db.collection('matches').doc('current');
        const snap = await ref.get();
        if (!snap.exists) return message.channel.send('⚠️ No active challenge match.');
        const match = snap.data();

        if (match.type !== 'challenge') {
            return message.channel.send('❌ This command is only for challenge matches.');
        }
        if (match.status !== 'pending') {
            return message.channel.send('⚠️ This challenge has already been responded to.');
        }
        if (profile.id !== match.captain2) {
            return message.channel.send('❌ Only the challenged player can respond.');
        }

        if (commandName === '!reject') {
            await ref.delete();
            return message.channel.send(
                `❌ Challenge rejected by \`${profile.id}\`. Match cancelled.`
            );
        }

        // === !accept ===
        // 1) Randomly pick who picks first:
        const firstPickTeam = Math.random() < 0.5 ? 'radiant' : 'dire';
        // 2) Update status and store firstPickTeam
        await ref.update({ status: 'waiting', firstPickTeam });
        // 3) Announce
        const firstCaptain = firstPickTeam === 'radiant'
            ? match.captain1
            : match.captain2;
        return message.channel.send(
            `✅ Challenge accepted by \`${profile.id}\`!\n` +
            `🎲 \`${firstCaptain}\` will pick first!\n` +
            `Players can now join with \`!sign\`.`
        );
    }
};
