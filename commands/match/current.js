const { EmbedBuilder } = require('discord.js');
const db = require('../../services/db');

module.exports = {
  name: '!current',
  async execute(message) {
    // Fetch all ongoing matches
    const snaps = await db.collection('ongoingMatches').get();
    if (snaps.empty) {
      return message.channel.send('⚠️ No ongoing matches right now.');
    }

    // Build embed listing each match
    const embed = new EmbedBuilder()
      .setTitle('🏃‍♂️ Ongoing Matches')
      .setColor(0xFFA500)
      .setTimestamp();

    for (const doc of snaps.docs) {
      const m = doc.data();
      let teamsStr;

      if (m.type === 'challenge') {
        // Challenge-style: captain + players
        const rad = [m.teams.radiant.captain, ...m.teams.radiant.players]
          .map(id => `\`${id}\``).join(', ');
        const dire = [m.teams.dire.captain, ...m.teams.dire.players]
          .map(id => `\`${id}\``).join(', ');
        teamsStr = `🟢 Radiant: ${rad}\n🔴 Dire: ${dire}`;
      } else {
        // Start-style: simple arrays
        const rad = m.teams.radiant.map(id => `\`${id}\``).join(', ');
        const dire = m.teams.dire.map(id => `\`${id}\``).join(', ');
        teamsStr = `🟢 Radiant: ${rad}\n🔴 Dire: ${dire}`;
      }

      embed.addFields({
        name: `Match ID: ${doc.id}`,
        value: `**Type:** ${m.type}
${teamsStr}
**Lobby:** ||\`${m.lobbyName}\`||`,
        inline: false
      });
    }

    return message.channel.send({ embeds: [embed] });
  }
};