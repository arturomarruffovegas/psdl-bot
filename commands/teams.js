// commands/teams.js
const { EmbedBuilder } = require('discord.js');
const playerService   = require('../services/playerService');
const matchService    = require('../services/matchService');
const teamPoolService = require('../services/teamPoolService');

module.exports = {
  name: '!teams',
  async execute(message) {
    // fetch all players once for lookups
    const all = await playerService.fetchAllPlayers();

    // helper: format each id with role/tier (+ crown if captain)
    const makeField = (ids, label, captainId = null) => ({
      name: label,
      value: ids.map(id => {
        const p     = all.find(u => u.id === id);
        const crown = id === captainId ? ' 👑' : '';
        return p
          ? `• \`${p.id}\`${crown} — (${p.role.toUpperCase()} - T${p.tier})`
          : `• \`${id}\`${crown} — (Unknown)`;
      }).join('\n'),
      inline: true
    });

    // 1) Challenge or start match?
    const match = await matchService.getCurrentMatch();
    if (match) {
      // --- Challenge
      if (match.type === 'challenge') {
        const { captain1, captain2, picks, status } = match;
        if (status === 'pending') {
          return message.channel.send('⚠️ Challenge not yet accepted.');
        }
        const radiant = [captain1, ...picks.radiant];
        const dire    = [captain2, ...picks.dire];

        const embed = new EmbedBuilder()
          .setTitle('📝 Challenge Teams')
          .setColor(0x0099FF)
          .addFields(
            makeField(radiant, '🟢 Radiant', captain1),
            makeField(dire,    '🔴 Dire',    captain2)
          )
          .setTimestamp();

        return message.channel.send({ embeds: [embed] });
      }

      // --- Start
      if (match.type === 'start') {
        if (match.status !== 'ready') {
          return message.channel.send('⚠️ Start match not ready yet.');
        }
        const { radiant, dire } = match.teams;
        // no captainId here, so omit third arg
        const embed = new EmbedBuilder()
          .setTitle('📝 Start Match Teams')
          .setColor(0x00CC66)
          .addFields(
            makeField(radiant, '🟢 Radiant'),
            makeField(dire,    '🔴 Dire')
          )
          .setTimestamp();

        return message.channel.send({ embeds: [embed] });
      }

      return message.channel.send('⚠️ Active match has an unrecognized type.');
    }

    // 2) Fallback to infinite‑pool split
    const split = await teamPoolService.getSplitResult?.();
    if (split) {
      const { radiant, dire } = split;
      const embed = new EmbedBuilder()
        .setTitle('📝 Picked Teams')
        .setColor(0x663399)
        .addFields(
          makeField(radiant, '🟢 Radiant'),
          makeField(dire,    '🔴 Dire')
        )
        .setTimestamp();

      return message.channel.send({ embeds: [embed] });
    }

    // 3) Nothing to show
    return message.channel.send('⚠️ No teams to display right now.');
  }
};