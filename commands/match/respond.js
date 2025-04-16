const playerService = require('../../services/playerService');
const matchService = require('../../services/matchService');
const db = require('../../services/db');

module.exports = {
    name: ['!accept', '!reject'],
    async execute(message, args, commandName) {
        const username = message.author.username.toLowerCase();
        const profile = await playerService.getPlayerProfileByUsername(username);
        if (!profile) return message.channel.send('❌ You are not registered.');

        const match = await matchService.getCurrentMatch();
        if (!match) return message.channel.send('⚠️ No active challenge match.');
        if (match.type !== 'challenge') {
            return message.channel.send('❌ This command is only applicable to challenge matches.');
        }
        if (match.status !== 'pending') {
            return message.channel.send('⚠️ This challenge has already been responded to.');
        }
        if (!match.captain2) {
            return message.channel.send('⚠️ This challenge is missing a challenged player.');
        }
        if (profile.id !== match.captain2) {
            return message.channel.send('❌ Only the challenged player can respond.');
        }

        if (commandName === '!reject') {
            // Abort the challenge
            const success = await matchService.abortMatch();
            if (!success) {
                return message.channel.send('❌ Failed to abort the match.');
            }
            return message.channel.send(`❌ Challenge was rejected by \`${profile.id}\`. Match cancelled.`);
        }

        if (commandName === '!accept') {
            // Update status to "waiting" so players can sign.
            await db.collection('matches').doc('current').update({ status: 'waiting' });
            return message.channel.send(`✅ Challenge accepted by \`${profile.id}\`! Players can now join using \`!sign\`.`);
        }
    }
};
