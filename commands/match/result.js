// commands/match/result.js
const playerService = require('../../services/playerService');
const matchService  = require('../../services/matchService');
const db            = require('../../services/db');

module.exports = {
  name: '!result',
  async execute(message, args) {
    // Fetch all ongoing matches
    const snap   = await db.collection('ongoingMatches').get();
    const docs   = snap.docs;
    const count  = docs.length;

    // Check for Discord role named "Admin"
    const isAdmin = message.member.roles.cache.some(r => r.name === 'Admin');

    if (count === 0) {
      return message.channel.send('❌ There are no ongoing matches to result.');
    }

    let selectedDoc;
    let resultTeam;

    if (isAdmin) {
      // ─────── ADMIN FLOW ───────
      if (count === 1) {
        // Single match: !result <radiant|dire>
        if (args.length !== 1) {
          return message.channel.send('❌ Admin usage: `!result <radiant|dire>`');
        }
        resultTeam  = args[0].toLowerCase();
        selectedDoc = docs[0];
      } else {
        // Multiple matches: !result <matchId> <radiant|dire>
        if (args.length !== 2) {
          return message.channel.send(
            '❌ Admin usage: `!result <matchId> <radiant|dire>`\n' +
            'Use `!current` to list all match IDs.'
          );
        }
        const [matchId, teamArg] = args;
        selectedDoc = docs.find(doc => doc.id === matchId);
        if (!selectedDoc) {
          return message.channel.send(`❌ Could not find a match with ID \`${matchId}\`.`);
        }
        resultTeam = teamArg.toLowerCase();
      }

    } else {
      // ───── CAPTAIN FLOW ─────
      if (count === 1) {
        // Single match: !result <radiant|dire>
        if (args.length !== 1) {
          return message.channel.send('❌ Usage: `!result <radiant|dire>`');
        }
        resultTeam  = args[0].toLowerCase();
        selectedDoc = docs[0];
      } else {
        // Multiple matches: !result <matchNumber> <radiant|dire>
        if (args.length !== 2) {
          return message.channel.send(
            '❌ Usage: `!result <matchNumber> <radiant|dire>`\n' +
            'Use `!current` to see match numbers.'
          );
        }
        const idx = parseInt(args[0], 10);
        if (isNaN(idx) || idx < 1 || idx > count) {
          return message.channel.send(
            `❌ Invalid match number. Please choose between 1 and ${count}. Use \`!current\` to see them.`
          );
        }
        resultTeam  = args[1].toLowerCase();
        selectedDoc = docs[idx - 1];
      }
    }

    // Validate team argument
    if (!['radiant', 'dire'].includes(resultTeam)) {
      return message.channel.send('❌ Invalid team. Use `radiant` or `dire`.');
    }

    // Identify sender
    const username = message.author.username.toLowerCase();
    const profile  = await playerService.getPlayerProfileByUsername(username);
    const matchData = selectedDoc.data();

    // If not admin, ensure they're a participant
    if (!isAdmin) {
      if (!profile) {
        return message.channel.send('❌ You are not registered.');
      }
      const ongoingForUser = await matchService.getOngoingMatchForUser(profile.id);
      if (!ongoingForUser || ongoingForUser.id !== selectedDoc.id) {
        return message.channel.send('❌ You are not a participant of that match.');
      }
    }

    // Submit result (admin bypasses participant rules)
    const userId    = profile ? profile.id : 'admin';
    const captainId = isAdmin ? userId : profile.id;
    const res       = await matchService.submitResult(
      userId,
      captainId,
      resultTeam,
      selectedDoc.id
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
          return message.channel.send('❌ You are not a participant of this match.');
        case 'already-submitted':
          return message.channel.send('❌ Match result has already been recorded.');
        default:
          return message.channel.send(`❌ Error: ${res.error}`);
      }
    }

    // Success response
    if (matchData.type === 'challenge') {
      return message.channel.send(
        `🏆 Match result recorded: **${res.winner.toUpperCase()}** wins!\n` +
        `Match closed.\n` +
        `Match ID: \`${res.matchId}\`\n` +
        `Review with \`!info ${res.matchId}\``
      );
    } else {
      // Voting flow for normal matches
      if (res.status === 'pending') {
        const r = res.votes.radiant;
        const d = res.votes.dire;
        return message.channel.send(
          `✅ Your vote for **${resultTeam.toUpperCase()}** has been recorded!\n\n` +
          `🟢 Radiant (${r.length}): ` +
            (r.length ? r.map(id => `\`${id}\``).join(', ') : '—') + `\n` +
          `🔴 Dire    (${d.length}): ` +
            (d.length ? d.map(id => `\`${id}\``).join(', ') : '—')
        );
      }
      // Finalized
      return message.channel.send(
        `🏆 Match result finalized: **${res.winner.toUpperCase()}** wins!\n` +
        `Match ID: \`${res.matchId}\`\n` +
        `Review with \`!info ${res.matchId}\``
      );
    }
  }
};