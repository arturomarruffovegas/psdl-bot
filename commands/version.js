module.exports = {
    name: '!version',
    async execute(message) {
      const version = process.env.BOT_VERSION || 'unknown';
      return message.channel.send(
        `🤖 Bot version: ${version}`
      );
    }
  };  