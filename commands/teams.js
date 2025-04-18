// commands/teams.js
const { EmbedBuilder } = require('discord.js');
const playerService   = require('../services/playerService');
const matchService    = require('../services/matchService');
const teamPoolService = require('../services/teamPoolService');

module.exports = {
  name: '!teams',
  async execute(message) {
    // 0) Who is calling?
    const username = message.author.username.toLowerCase();
    const profile  = await playerService.getPlayerProfileByUsername(username);
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }

    // helper: format each id with role/tier (+ crown if captain)
    const all = await playerService.fetchAllPlayers();
    const makeField = (ids, label, captainId = null) => ({
      name:  label,
      value: ids.map(id => {
        const p     = all.find(u => u.id === id);
        const crown = id === captainId ? ' 👑' : '';
        return p
          ? `• \`${p.id}\`${crown} — (${p.role.toUpperCase()} - T${p.tier})`
          : `• \`${id}\`${crown} — (Unknown)`;
      }).join('\n'),
      inline: true
    });

    // 1) Check for an ongoing match for this user
    const ongoing = await matchService.getOngoingMatchForUser(profile.id);
    if (ongoing) {
      const embed = new EmbedBuilder()
        .setTimestamp();

      if (ongoing.type === 'challenge') {
        // challenge stores teams with { captain, players }
        const { captain1, captain2, teams } = ongoing;
        embed
          .setTitle('🎮 Ongoing Challenge Teams')
          .addFields(
            makeField(
              [teams.radiant.captain, ...teams.radiant.players],
              '🟢 Radiant',
              teams.radiant.captain
            ),
            makeField(
              [teams.dire.captain, ...teams.dire.players],
              '🔴 Dire',
              teams.dire.captain
            )
          );
      } else {
        // start‑match stores teams as simple arrays
        const { teams } = ongoing;
        embed
          .setTitle('🎮 Ongoing Start Match Teams')
          .addFields(
            makeField(teams.radiant, '🟢 Radiant'),
            makeField(teams.dire,    '🔴 Dire')
          );
      }

      return message.channel.send({ embeds: [embed] });
    }

    // 2) No ongoing match → check the current pregame (challenge or start)
    const match = await matchService.getCurrentMatch();
    if (match) {
      // --- Pregame Challenge ---
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

      // --- Pregame Start Match ---
      if (match.type === 'start') {
        if (match.status !== 'ready') {
          return message.channel.send('⚠️ Start match not ready yet.');
        }
        const { radiant, dire } = match.teams;
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

    // 3) Fallback to infinite‑pool split
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

    // 4) Nothing to show
    return message.channel.send('⚠️ No teams to display right now.');
  }
};