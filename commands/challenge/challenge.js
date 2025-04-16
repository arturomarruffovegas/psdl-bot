const playerService = require('../../services/playerService');
const challengeService = require('../../services/challengeService');

module.exports = {
    name: '!challenge',
    async execute(message, args) {
        if (args.length !== 1) {
            return message.channel.send('❌ Usage: `!challenge <userId>`');
        }

        const challengedId = args[0].trim();
        const challengerProfile = await playerService.getPlayerProfileByUsername(message.author.username);
        const challengedProfile = await playerService.getPlayerProfileById(challengedId);

        if (!challengerProfile || !challengedProfile) {
            return message.channel.send('❌ Both you and the challenged player must be registered.');
        }

        if (challengerProfile.id === challengedProfile.id) {
            return message.channel.send('❌ You cannot challenge yourself.');
        }

        try {
            const result = await challengeService.createChallenge(challengerProfile.id, challengedProfile.id);

            if (!result) {
                return message.channel.send('⚠️ A challenge is already in progress. Use `!abort` to cancel it.');
            }

            return message.channel.send(
                `⚔️ **${challengerProfile.id}** has challenged **${challengedProfile.id}**!\n👉 **${challengedProfile.id}**, type \`!accept\` to begin or \`!reject\` to cancel.`
            );
        } catch (err) {
            console.error('[CHALLENGE] Failed to create challenge:', err);
            return message.channel.send('❌ An error occurred while creating the challenge.');
        }
    }
};
