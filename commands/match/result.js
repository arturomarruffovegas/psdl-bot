// commands/match/result.js
const playerService = require('../../services/playerService');
const matchService  = require('../../services/matchService');
const db            = require('../../services/db');

module.exports = {
  name: '!result',
  async execute(message, args) {
    const isAdmin = message.member.roles.cache.some(r => r.name === 'Admin');

    // ─── ADMIN: direct close flow ─────────────────────────────────────────────
    if (isAdmin) {
      // require exactly: !result <matchId> <radiant|dire>
      if (args.length !== 2) {
        return message.channel.send(
          '❌ Admin usage: `!result <matchId> <radiant|dire>`'
        );
      }
      const [matchId, teamArg] = args;
      const resultTeam = teamArg.toLowerCase();
      if (!['radiant','dire'].includes(resultTeam)) {
        return message.channel.send('❌ Invalid team. Use `radiant` or `dire`.');
      }

      // verify it exists
      const snap = await db.collection('ongoingMatches').doc(matchId).get();
      if (!snap.exists) {
        return message.channel.send(`❌ No ongoing match with ID \`${matchId}\`.`);
      }

      // immediate close
      const res = await matchService.adminCloseMatch(matchId, resultTeam);
      if (res.error) {
        return message.channel.send(`❌ Error closing match: ${res.error}`);
      }

      return message.channel.send(
        `🏆 (Admin) Match \`${matchId}\` closed: **${resultTeam.toUpperCase()}** wins!\n` +
        `Review with \`!info ${matchId}\``
      );
    }

    // ─── PLAYER: existing shorthand/voting/challenge flow ────────────────────
    // args must be exactly one: !result <radiant|dire>
    if (args.length !== 1) {
      return message.channel.send('❌ Usage: `!result <radiant|dire>`');
    }
    const resultTeam = args[0].toLowerCase();
    if (!['radiant','dire'].includes(resultTeam)) {
      return message.channel.send('❌ Invalid team. Use `radiant` or `dire`.');
    }

    // find the caller's ongoing match
    const username = message.author.username.toLowerCase();
    const profile  = await playerService.getPlayerProfileByUsername(username);
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }
    const ongoing = await matchService.getOngoingMatchForUser(profile.id);
    if (!ongoing) {
      return message.channel.send('❌ You are not in any ongoing match.');
    }

    // submit via normal path
    const { id: matchId, type } = ongoing;
    const res = await matchService.submitResult(
      profile.id,      // userId
      profile.id,      // captainId (for challenges)
      resultTeam,
      matchId
    );

    // handle errors exactly as before
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
        case 'already-submitted':
          return message.channel.send('❌ Match result has already been recorded.');
        default:
          return message.channel.send(`❌ Error: ${res.error}`);
      }
    }

    // success message
    if (type === 'challenge') {
      return message.channel.send(
        `🏆 Match result recorded: **${res.winner.toUpperCase()}** wins!\n` +
        `Match closed.\n` +
        `Match ID: \`${res.matchId}\`\n` +
        `Review with \`!info ${res.matchId}\``
      );
    }

    // voting flow for normal matches
    if (res.status === 'pending') {
      const r = res.votes.radiant;
      const d = res.votes.dire;
      return message.channel.send(
        `✅ Your vote for **${resultTeam.toUpperCase()}** has been recorded!\n\n` +
        `🟢 Radiant (${r.length}): ${r.length ? r.map(id => `\`${id}\``).join(', ') : '—'}\n` +
        `🔴 Dire    (${d.length}): ${d.length ? d.map(id => `\`${id}\``).join(', ') : '—'}`
      );
    }

    // finalized
    return message.channel.send(
      `🏆 Match result finalized: **${res.winner.toUpperCase()}** wins!\n` +
      `Match ID: \`${res.matchId}\`\n` +
      `Review with \`!info ${res.matchId}\``
    );
  }
};