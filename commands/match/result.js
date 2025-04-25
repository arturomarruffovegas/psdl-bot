// commands/match/result.js
const playerService = require('../../services/playerService');
const matchService  = require('../../services/matchService');
const db            = require('../../services/db');

module.exports = {
  name: '!result',
  async execute(message, args) {
    const isAdmin = message.member.roles.cache.some(r => r.name === 'Admin');

    let matchId, resultTeam, data;

    if (isAdmin) {
      // ───── ADMIN: must supply matchId + team ─────
      if (args.length !== 2) {
        return message.channel.send(
          '❌ Admin usage: `!result <matchId> <radiant|dire>`\n' +
          'Use `!current` to list matches.'
        );
      }
      [matchId, resultTeam] = [args[0], args[1].toLowerCase()];
      if (!['radiant','dire'].includes(resultTeam)) {
        return message.channel.send('❌ Invalid team. Use `radiant` or `dire`.');
      }
      const snap = await db.collection('ongoingMatches').doc(matchId).get();
      if (!snap.exists) {
        return message.channel.send(`❌ No ongoing match with ID \`${matchId}\`.`);
      }
      data = snap.data();
    } else {
      // ───── PLAYER: must supply only team ─────
      if (args.length !== 1) {
        return message.channel.send('❌ Usage: `!result <radiant|dire>`');
      }
      resultTeam = args[0].toLowerCase();
      if (!['radiant','dire'].includes(resultTeam)) {
        return message.channel.send('❌ Invalid team. Use `radiant` or `dire`.');
      }
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

    // Admin finalizing a start‐type match immediately
    if (isAdmin && data.type === 'start') {
      // normalize player arrays
      const radArr = Array.isArray(data.teams.radiant.players)
        ? data.teams.radiant.players
        : data.teams.radiant;
      const dirArr = Array.isArray(data.teams.dire.players)
        ? data.teams.dire.players
        : data.teams.dire;

      // build finalized record
      const finalRec = {
        createdAt: new Date().toISOString(),
        radiant:   { players: radArr },
        dire:      { players: dirArr },
        winner:    resultTeam,
        lobbyName: data.lobbyName,
        password:  data.password
      };
      const finalDocRef = await db.collection('finalizedMatches').add(finalRec);

      // adjust points
      const batch = db.batch();
      const delta = 25;
      const winners = resultTeam === 'radiant' ? radArr : dirArr;
      const losers  = resultTeam === 'radiant' ? dirArr : radArr;
      for (const pid of winners) {
        const uref = db.collection('players').doc(pid);
        const usnap = await uref.get();
        if (usnap.exists) {
          const pts = usnap.data().points ?? 1000;
          batch.update(uref, { points: pts + delta });
        }
      }
      for (const pid of losers) {
        const uref = db.collection('players').doc(pid);
        const usnap = await uref.get();
        if (usnap.exists) {
          const pts = usnap.data().points ?? 1000;
          batch.update(uref, { points: pts - delta });
        }
      }
      await batch.commit();

      // remove from ongoing
      await db.collection('ongoingMatches').doc(matchId).delete();

      return message.channel.send(
        `🏆 Match result recorded: **${resultTeam.toUpperCase()}** wins!\n` +
        `Match ID: \`${finalDocRef.id}\`\n` +
        `Review with \`!info ${finalDocRef.id}\``
      );
    }

    // For challenge (any) or player‐voting start
    // Identify userId and captainId
    const username = message.author.username.toLowerCase();
    const profile  = await playerService.getPlayerProfileByUsername(username);
    const userId   = profile ? profile.id : 'admin';
    let captainId;
    if (data.type === 'challenge') {
      // admin override picks the captain of the winning side
      captainId = isAdmin
        ? (resultTeam === 'radiant' ? data.captain1 : data.captain2)
        : profile.id;
    } else {
      // start type: captainId unused
      captainId = profile.id;
    }

    // Submit via matchService
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

    // Success response
    if (data.type === 'challenge') {
      return message.channel.send(
        `🏆 Match result recorded: **${res.winner.toUpperCase()}** wins!\n` +
        `Match closed.\n` +
        `Match ID: \`${res.matchId}\`\n` +
        `Review with \`!info ${res.matchId}\``
      );
    } else {
      // start‐match voting flow
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