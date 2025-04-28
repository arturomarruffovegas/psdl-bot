// commands/match/pick.js
const playerService = require('../../services/playerService');
const matchService = require('../../services/matchService');

module.exports = {
  name: '!pick',
  async execute(message, args) {
    // 1) Validate usage
    if (args.length !== 1) {
      return message.channel.send('❌ Usage: `!pick <userId>`');
    }
    const input = args[0].trim();

    // 2) Lookup caller profile
    const profile = await playerService.getPlayerProfileByUsername(
      message.author.username.toLowerCase()
    );
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }

    // 3) Resolve partial ID in challenge pool
    let pickId = input;
    const current = await matchService.getCurrentMatch();
    if (current && current.type === 'challenge') {
      const pool = current.pool;
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

    // 4) Attempt the pick
    const result = await matchService.pickPlayer(profile.id, pickId);

    // 5) Handle errors
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

    // 6) Summary for this pick
    const summary = `✅ \`${pickId}\` has been picked for the **${result.team} Team**.`;

    // 7) If finalized, fetch full match to include captains
    if (result.finalized) {
      const { lobbyName, password } = result.finalized;
      const allPlayers = await playerService.fetchAllPlayers();

      // Get the archived ongoing match (now in ongoingMatches) to include captains
      const ongoingMatch = await matchService.getOngoingMatchForUser(profile.id);
      const { teams: fullTeams, type } = ongoingMatch;
      const isChallenge = type === 'challenge';

      // Helper to build each side, showing captain if challenge
      const buildSide = (sideObj, label) => {
        let text = `**${label} Team**`;
        if (isChallenge && sideObj.captain) {
          text += `\n👑 \`${sideObj.captain}\``;
        }
        const players = isChallenge ? sideObj.players : sideObj;
        for (const id of players) {
          const p = allPlayers.find(u => u.id === id);
          text += `\n• \`${id}\` — (${p ? p.role.toUpperCase() : 'UNK'} - T${p ? p.tier : '?'})`;
        }
        return text;
      };

      const radiantText = buildSide(fullTeams.radiant, 'Radiant');
      const direText = buildSide(fullTeams.dire, 'Dire');

      return message.channel.send(
        `${summary}\n\n🎮 **Match Ready!**\n` +
        `🟢 ${radiantText}\n\n` +
        `🔴 ${direText}\n\n` +
        `🧩 Lobby: ||\`${lobbyName}\`||\n` +
        `🔐 Password: ||\`${password}\`||\n\n` +
        `Captains must now report the result using \`!result radiant\` or \`!result dire\`.`
      );
    }

    // 8) Still drafting: prompt next captain
    const nextCap = result.team === 'Radiant'
      ? current.captain2
      : current.captain1;

    return message.channel.send(
      `${summary}\n🎯 **${nextCap}**, it's your turn to pick.`
    );
  }
};