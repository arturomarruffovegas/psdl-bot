// commands/roll.js
module.exports = {
    name: '!roll',
    async execute(message) {
      const min = 0;
      const max = 100;
      const roll = Math.floor(Math.random() * (max - min + 1)) + min;
      return message.channel.send(
        `🎲 **${message.author.username}** rolled a **${roll}**!`
      );
    }
  };