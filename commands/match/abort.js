const matchService = require('../../services/matchService');

module.exports = {
    name: '!abort',
    async execute(message, args) {
        const success = await matchService.abortMatch();
        if (!success) {
            return message.channel.send('⚠️ No active match to abort.');
        }
        return message.channel.send('🛑 The current match has been **aborted**.');
    }
};
