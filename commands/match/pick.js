// commands/match/pick.js
const playerService = require('../../services/playerService');
const matchService  = require('../../services/matchService');

module.exports = {
  name: '!pick',
  async execute(message, args) {
    if (args.length !== 1) {
      return message.channel.send('❌ Usage: `!pick <userId>`');
    }
    const pickId  = args[0].trim();
    const profile = await playerService.getPlayerProfileByUsername(
      message.author.username.toLowerCase()
    );
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }

    // Attempt the pick
    const result = await matchService.pickPlayer(profile.id, pickId);

    // Error handling
    if (result.error) {
      switch (result.error) {
        case 'no-match':
          return message.channel.send('❌ No active challenge match.');
        case 'not-applicable':
          return message.channel.send('❌ Not a challenge match.');
        case 'not-enough-players':
          return message.channel.send(
            '❌ Not enough players signed up to start drafting. Wait until at least 8 have `!sign`ed.'
          );
        case 'not-captain':
          return message.channel.send('❌ Only captains can pick players.');
        case 'not-your-turn':
          return message.channel.send('⚠️ It is not your turn.');
        case 'not-in-pool':
          return message.channel.send('⚠️ That player is not in the pool.');
        default:
          return message.channel.send('❌ An unknown error occurred during picking.');
      }
    }

    // Summary of this pick
    const summary = `✅ \`${pickId}\` has been picked for the **${result.team} Team**.`;

    // === Draft complete ===
    if (result.finalized) {
      // Destructure out the finalized payload
      const { finalized } = result;
      const { teams, lobbyName, password } = finalized;

      // Fetch all profiles once for formatting
      const allPlayers = await playerService.fetchAllPlayers();
      const formatTeam = (ids, label) => {
        return `**${label} Team**\n` +
          ids.map(id => {
            const p = allPlayers.find(u => u.id === id);
            return p
              ? `• \`${p.id}\` — (${p.role.toUpperCase()} - T${p.tier})`
              : `• \`${id}\``;
          }).join('\n');
      };

      // Send the full “Match Ready!” summary
      return message.channel.send(
        `${summary}\n\n🎮 **Match Ready!**\n` +
        `🟢 ${formatTeam(teams.radiant, 'Radiant')}\n\n` +
        `🔴 ${formatTeam(teams.dire, 'Dire')}\n\n` +
        `🧩 Lobby: ||\`${lobbyName}\`||\n` +
        `🔐 Password: ||\`${password}\`||\n\n` +
        `Captains must now report the result using \`!result radiant\` or \`!result dire\`.`
      );
    }

    // === Still drafting: prompt next captain ===
    const current = await matchService.getCurrentMatch();
    const nextCap = result.team === 'Radiant'
      ? current.captain2
      : current.captain1;

    return message.channel.send(
      `${summary}\n🎯 **${nextCap}**, it's your turn to pick.`
    );
  }
};