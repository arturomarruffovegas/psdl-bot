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
        case 'no-match':      return message.channel.send('❌ No active challenge match.');
        case 'not-applicable':return message.channel.send('❌ Not a challenge match.');
        case 'not-captain':   return message.channel.send('❌ Only captains can pick players.');
        case 'not-your-turn': return message.channel.send('⚠️ It is not your turn.');
        case 'not-in-pool':   return message.channel.send('⚠️ That player is not in the pool.');
        default:              return message.channel.send('❌ An unknown error occurred during picking.');
      }
    }

    const summary = `✅ \`${pickId}\` has been picked for the **${result.team} Team**.`;

    // If we just finished the 5v5…
    if (result.finalized) {
      const { teams, finalized } = result;

      // Load all players once for role/tier lookups
      const allPlayers = await playerService.fetchAllPlayers();

      // Format a single team, injecting role/tier
      const formatTeam = (ids, label) => {
        return `**${label} Team**\n` +
          ids.map(id => {
            const p = allPlayers.find(u => u.id === id);
            return p
              ? `• \`${p.id}\` — (${p.role.toUpperCase()} - T${p.tier})`
              : `• \`${id}\``;
          }).join('\n');
      };

      const lobbySpoiler    = `||\`${finalized.lobbyName}\`||`;
      const passwordSpoiler = `||\`${finalized.password}\`||`;

      return message.channel.send(
        `${summary}\n\n🎮 **Match Ready!**\n` +
        `🟢 ${formatTeam(teams.radiant, 'Radiant')}\n\n` +
        `🔴 ${formatTeam(teams.dire, 'Dire')}\n\n` +
        `🧩 Lobby: ${lobbySpoiler}\n` +
        `🔐 Password: ${passwordSpoiler}\n\n` +
        `Captains must now report the result using \`!result radiant\` or \`!result dire\`.`
      );
    }

    // Otherwise still drafting → tell next captain
    // (we can re-fetch the very small current doc to find the next captain)
    const cur = await matchService.getCurrentMatch();
    const nextCap = result.team === 'Radiant'
      ? cur.captain2
      : cur.captain1;

    return message.channel.send(
      `${summary}\n🎯 **${nextCap}**, it's your turn to pick.`
    );
  }
};
