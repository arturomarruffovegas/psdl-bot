// commands/match/pick.js
const playerService = require('../../services/playerService');
const matchService = require('../../services/matchService');

module.exports = {
  name: '!pick',
  async execute(message, args) {
    // Validate usage
    if (args.length !== 1) {
      return message.channel.send('❌ Usage: `!pick <userId>`');
    }
    const input = args[0].trim();

    // Look up caller
    const profile = await playerService.getPlayerProfileByUsername(
      message.author.username.toLowerCase()
    );
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }

    // Resolve partial ID in challenge pool
    let pickId = input;
    const current = await matchService.getCurrentMatch();
    if (current && current.type === 'challenge') {
      const pool = current.pool;
      // Case-insensitive startsWith matching
      const matches = pool.filter(id =>
        id.toLowerCase().startsWith(input.toLowerCase())
      );
      if (matches.length > 1) {
        return message.channel.send(
          `⚠️ Multiple players match \`${input}\`: ${matches.map(m => `\`${m}\``).join(', ')}. Please be more specific.`
        );
      }
      if (matches.length === 1) {
        pickId = matches[0];
      }
    }

    // Attempt the pick with resolved ID
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
      const { finalized } = result;
      const { teams, lobbyName, password } = finalized;
      const allPlayers = await playerService.fetchAllPlayers();
      // Detect challenge vs start by presence of captains
      const isChallenge =
        teams.radiant?.captain !== undefined &&
        teams.dire?.captain !== undefined;

      // Format one side helper
      const buildSide = (side, label) => {
        let text = `**${label} Team**`;
        if (isChallenge && side.captain) {
          text += `\n👑 \`${side.captain}\``;
        }
        const ids = isChallenge ? side.players : side;
        for (const id of ids) {
          const p = allPlayers.find(u => u.id === id);
          const line = p
            ? `• \`${id}\` — (${p.role.toUpperCase()} - T${p.tier})`
            : `• \`${id}\``;
          text += `\n${line}`;
        }
        return text;
      };

      const radiantText = buildSide(teams.radiant, 'Radiant');
      const direText = buildSide(teams.dire, 'Dire');

      return message.channel.send(
        `${summary}\n\n🎮 **Match Ready!**\n` +
        `🟢 ${radiantText}\n\n` +
        `🔴 ${direText}\n\n` +
        `🧩 Lobby: ||\`${lobbyName}\`||\n` +
        `🔐 Password: ||\`${password}\`||\n\n` +
        `Captains must now report the result using \`!result radiant\` or \`!result dire\`.`
      );
    }

    // === Still drafting: next captains ===
    const nextCap = result.team === 'Radiant'
      ? current.captain2
      : current.captain1;

    return message.channel.send(
      `${summary}\n🎯 **${nextCap}**, it's your turn to pick.`
    );
  }
};