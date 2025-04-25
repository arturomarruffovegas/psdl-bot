// commands/match/result.js
const playerService = require('../../services/playerService');
const matchService  = require('../../services/matchService');
const db            = require('../../services/db');

module.exports = {
  name: '!result',
  async execute(message, args) {
    const isAdmin = message.member.roles.cache.some(r => r.name === 'Admin');

    let matchId, resultTeam, data;

    // PLAYER FLOW: single-arg shorthand works for anyone in a match
    if (args.length === 1) {
      resultTeam = args[0].toLowerCase();
      if (!['radiant','dire'].includes(resultTeam)) {
        return message.channel.send('❌ Invalid team. Use `radiant` or `dire`.');
      }

      // find the caller's ongoing match
      const username = message.author.username.toLowerCase();
      const profile  = await playerService.getPlayerProfileByUsername(username);
      if (!profile) {
        return message.channel.send('❌ You are not registered.');
      }
      const ongoing  = await matchService.getOngoingMatchForUser(profile.id);
      if (!ongoing) {
        return message.channel.send('❌ You are not in any ongoing match.');
      }

      matchId = ongoing.id;
      data    = ongoing;
    }
    // ADMIN FLOW: two-arg explicit
    else if (isAdmin && args.length === 2) {
      [matchId, resultTeam] = [args[0], args[1].toLowerCase()];
      if (!['radiant','dire'].includes(resultTeam)) {
        return message.channel.send('❌ Invalid team. Use `radiant` or `dire`.');
      }

      const snap = await db.collection('ongoingMatches').doc(matchId).get();
      if (!snap.exists) {
        return message.channel.send(`❌ No ongoing match with ID \`${matchId}\`.`);
      }
      data = snap.data();
    }
    // otherwise invalid usage
    else {
      // if caller is admin, remind about two-arg
      if (isAdmin) {
        return message.channel.send(
          '❌ Admin usage: `!result <matchId> <radiant|dire>`\n' +
          'Or, as a participant, simply: `!result <radiant|dire>`'
        );
      }
      // non-admin incorrect usage
      return message.channel.send('❌ Usage: `!result <radiant|dire>`');
    }

    // Now we have matchId, resultTeam, and match data.
    // Identify IDs for submission:
    const username = message.author.username.toLowerCase();
    const profile  = await playerService.getPlayerProfileByUsername(username);
    const userId   = profile ? profile.id : 'admin';

    let captainId;
    if (data.type === 'challenge') {
      // challenge requires captain-level submission
      captainId = profile ? profile.id : 'admin';
    } else {
      // start matches use voting—captainId not used
      captainId = profile ? profile.id : 'admin';
    }

    // Submit the result
    const res = await matchService.submitResult(
      userId,
      captainId,
      resultTeam,
      matchId
    );

    // Handle errors
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
          return message.channel.send('❌ You are not a participant of that match.');
        case 'already-submitted':
          return message.channel.send('❌ Match result has already been recorded.');
        default:
          return message.channel.send(`❌ Error: ${res.error}`);
      }
    }

    // Success
    if (data.type === 'challenge') {
      return message.channel.send(
        `🏆 Match result recorded: **${res.winner.toUpperCase()}** wins!\n` +
        `Match closed.\n` +
        `Match ID: \`${res.matchId}\`\n` +
        `Review with \`!info ${res.matchId}\``
      );
    } else {
      // start‐match voting
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
  }
};