const playerService = require('../../services/playerService');
const db = require('../../services/db');

module.exports = {
    name: ['!accept', '!reject'],
    async execute(message, args, commandName) {
        const username = message.author.username;
        const snapshot = await db.collection('challenges').doc('current').get();

        if (!snapshot.exists) {
            return message.channel.send('⚠️ There is no pending challenge.');
        }

        const challengeData = snapshot.data();

        if (challengeData.status !== 'pending') {
            return message.channel.send('⚠️ This challenge has already been accepted or started.');
        }

        if (!challengeData.captain2) {
            return message.channel.send('⚠️ This challenge is missing a challenged player.');
        }

        const player = await playerService.getPlayerProfileByUsername(username);

        console.log(username);
        console.log(challengeData);
        console.log(player);

        if (!player || player.id !== challengeData.captain2) {
            return message.channel.send('❌ Only the challenged player can respond to this challenge.');
        }

        if (commandName === '!reject') {
            await db.collection('challenges').doc('current').delete();
            return message.channel.send(`❌ Challenge was rejected by \`${player.id}\`. Challenge cancelled.`);
        }

        if (commandName === '!accept') {
            await db.collection('challenges').doc('current').update({ status: 'waiting' });
            return message.channel.send(`✅ Challenge accepted by \`${player.id}\`! Players can now join the pool using \`!sign\`.`);
        }
    }
};
