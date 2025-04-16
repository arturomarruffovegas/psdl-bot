// commands/teams.js
const { EmbedBuilder } = require('discord.js');
const playerService   = require('../services/playerService');
const matchService    = require('../services/matchService');
const teamPoolService = require('../services/teamPoolService');

module.exports = {
  name: '!teams',
  async execute(message) {
    // 1) Try an active challenge or start match first
    const match = await matchService.getCurrentMatch();
    if (match) {
      if (match.type === 'challenge') {
        const { captain1, captain2, picks, status } = match;
        if (status === 'pending') {
          return message.channel.send('⚠️ Challenge not yet accepted.');
        }
        const radiant = [captain1, ...picks.radiant];
        const dire    = [captain2, ...picks.dire];
        const all     = await playerService.fetchAllPlayers();

        const makeField = (ids, cap, label) => ({
          name: label,
          value: ids.map(id => {
            const p     = all.find(u => u.id === id);
            const crown = id === cap ? ' 👑' : '';
            return p
              ? `• \`${p.id}\`${crown} — (${p.role.toUpperCase()}‑T${p.tier})`
              : `• \`${id}\`${crown}`;
          }).join('\n'),
          inline: true
        });

        const embed = new EmbedBuilder()
          .setTitle('📝 Challenge Teams')
          .setColor(0x0099FF)
          .addFields(
            makeField(radiant, captain1, '🟢 Radiant'),
            makeField(dire,    captain2, '🔴 Dire')
          )
          .setTimestamp();

        return message.channel.send({ embeds: [embed] });
      }

      if (match.type === 'start') {
        if (match.status !== 'ready') {
          return message.channel.send('⚠️ Start match not ready yet.');
        }
        const { radiant, dire } = match.teams;
        const makeField = (ids, label) => ({
          name: label,
          value: ids.map(id => `• \`${id}\``).join('\n'),
          inline: true
        });
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

    // 2) Fallback to any created infinite pool split
    const teams = await teamPoolService.getSplitResult?.();
    if (teams) {
      const makeField = (ids, label) => ({
        name: label,
        value: ids.map(id => `• \`${id}\``).join('\n'),
        inline: true
      });
      const embed = new EmbedBuilder()
        .setTitle('📝 Picked Teams')
        .setColor(0x663399)
        .addFields(
          makeField(teams.radiant, '🟢 Radiant'),
          makeField(teams.dire,    '🔴 Dire')
        )
        .setTimestamp();

      return message.channel.send({ embeds: [embed] });
    }

    // 3) Nothing to show
    return message.channel.send('⚠️ No teams to display right now.');
  }
};
