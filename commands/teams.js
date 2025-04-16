// commands/match/teams.js
const { EmbedBuilder } = require('discord.js');
const playerService = require('../../services/playerService');
const matchService  = require('../../services/matchService');

module.exports = {
  name: '!teams',
  async execute(message) {
    // 1) Fetch current active match
    const match = await matchService.getCurrentMatch();
    if (!match) {
      return message.channel.send('⚠️ No active match in progress.');
    }

    // 2) Prepare the two team arrays and a title depending on match type
    let radiantIds = [], direIds = [], title = '';
    if (match.type === 'challenge') {
      // During a challenge pre‑pick or post‑pick state:
      const { captain1, captain2, picks, status } = match;
      // If status still pending, nobody’s accepted yet:
      if (status === 'pending') {
        return message.channel.send('⚠️ Challenge not yet accepted.');
      }
      radiantIds = [captain1, ...picks.radiant];
      direIds    = [captain2, ...picks.dire];
      title      = '📝 Current Challenge Teams';
    } else if (match.type === 'start') {
      // For start matches only once they’re “ready”:
      if (match.status !== 'ready') {
        return message.channel.send('⚠️ Start match not ready yet. Waiting on sign‑ups.');
      }
      radiantIds = match.teams.radiant;
      direIds    = match.teams.dire;
      title      = '📝 Current Start Match Teams';
    } else {
      return message.channel.send('⚠️ Unknown match type.');
    }

    // 3) Fetch all players for role/tier lookup
    const allPlayers = await playerService.fetchAllPlayers();

    // 4) Build embed fields
    const makeField = (ids, label) => ({
      name: label,
      value: ids.length
        ? ids.map(id => {
            const p = allPlayers.find(u => u.id === id);
            return p
              ? `• \`${p.id}\` — (${p.role.toUpperCase()} - T${p.tier}${id === (label.includes('Radiant') ? radiantIds[0] : direIds[0]) ? ' 👑' : ''})`
              : `• \`${id}\``;
          }).join('\n')
        : '_No players_',
      inline: true
    });

    // 5) Construct and send the embed
    const embed = new EmbedBuilder()
      .setTitle(title)
      .addFields(
        makeField(radiantIds, '🟢 Radiant'),
        makeField(direIds,    '🔴 Dire')
      )
      .setFooter({ text: 'Use !pick to continue picking or !sign to join.' })
      .setTimestamp();

    return message.channel.send({ embeds: [embed] });
  }
};