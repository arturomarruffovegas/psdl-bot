// commands/match/result.js
const playerService = require('../../services/playerService');
const matchService  = require('../../services/matchService');

module.exports = {
  name: '!result',
  async execute(message, args) {
    // 1) Validate arguments
    if (args.length !== 1) {
      return message.channel.send('❌ Usage: `!result <radiant|dire>`');
    }
    const resultTeam = args[0].toLowerCase();
    if (!['radiant', 'dire'].includes(resultTeam)) {
      return message.channel.send('❌ Invalid team. Use `radiant` or `dire`.');
    }

    // 2) Look up the caller’s profile
    const username = message.author.username.toLowerCase();
    const profile  = await playerService.getPlayerProfileByUsername(username);
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }

    // 3) Find the ongoing match for this user
    const ongoing = await matchService.getOngoingMatchForUser(profile.id);
    if (!ongoing) {
      return message.channel.send('❌ You are not currently in an ongoing match.');
    }

    // 4) Submit the result
    const res = await matchService.submitResult(
      profile.id,    // userId
      profile.id,    // captainId (for challenge)
      resultTeam,    // “radiant” or “dire”
      ongoing.id     // the doc ID in ongoingMatches
    );

    // 5) Handle any errors
    if (res.error) {
      switch (res.error) {
        case 'invalid-team':
          return message.channel.send('❌ Invalid team specified.');
        case 'no-match':
          return message.channel.send('❌ Match not found or already closed.');
        case 'not-captain':
          return message.channel.send('❌ Only captains can report challenge results.');
        case 'already-voted':
          return message.channel.send('⚠️ You have already voted.');
        case 'not-participant':
          return message.channel.send('❌ You are not a participant of this match.');
        default:
          return message.channel.send(`❌ Error: ${res.error}`);
      }
    }

    // 6) Success!
    if (ongoing.type === 'challenge') {
      // single submission by captains
      return message.channel.send(
        `🏆 Match result recorded: **${res.winner.toUpperCase()}** wins!\n` +
        `Challenge closed.\n` +
        `Match ID: \`${res.matchId}\`\n` +
        `Review with \`!info <matchId>\``
      );
    } else {
      // start‑match voting flow
      if (res.status === 'pending') {
        const r = res.votes.radiant;
        const d = res.votes.dire;
        return message.channel.send(
          `✅ Your vote for **${resultTeam.toUpperCase()}** has been recorded!\n\n` +
          `🟢 Radiant (${r.length} vote${r.length !== 1 ? 's' : ''}): ` +
            (r.length ? r.map(id => `\`${id}\``).join(', ') : '—') + '\n' +
          `🔴 Dire    (${d.length} vote${d.length !== 1 ? 's' : ''}): ` +
            (d.length ? d.map(id => `\`${id}\``).join(', ') : '—')
        );
      }
      // finalized
      return message.channel.send(
        `🏆 Match result finalized: **${res.winner.toUpperCase()}** wins!\n` +
        `Match ID: \`${res.matchId}\`\n` +
        `Review with \`!info <matchId>\``
      );
    }
  }
};
