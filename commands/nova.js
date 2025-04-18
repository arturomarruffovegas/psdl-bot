const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: '!nova',
  async execute(message) {
    const embed = new EmbedBuilder()
      .setTitle('Catch me live on Kick!')
      .setURL('https://kick.com/novadota');
    return message.channel.send({ embeds: [embed] });
  }
};