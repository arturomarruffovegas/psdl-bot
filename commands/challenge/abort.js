const challengeService = require('../../services/challengeService');

module.exports = {
    name: '!abort',
    async execute(message) {
        const success = await challengeService.abortChallenge();

        if (!success) {
            return message.channel.send('⚠️ No active challenge to abort.');
        }

        return message.channel.send('🛑 The current challenge has been **aborted**.');
    }
};
