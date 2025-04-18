// commands/match/result.js
const playerService = require('../../services/playerService');
const matchService  = require('../../services/matchService');
const db            = require('../../services/db');

module.exports = {
  name: '!result',
  async execute(message, args) {
    // 1) Validar args
    if (args.length !== 1) {
      return message.channel.send('❌ Usage: `!result <radiant|dire>`');
    }
    const resultTeam = args[0].toLowerCase();
    if (!['radiant', 'dire'].includes(resultTeam)) {
      return message.channel.send('❌ Invalid team. Use `radiant` or `dire`.');
    }

    // 2) Obtener perfil del usuario
    const username = message.author.username.toLowerCase();
    const profile  = await playerService.getPlayerProfileByUsername(username);
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }

    // 3) Buscar la partida en curso en ongoingMatches
    const snaps = await db.collection('ongoingMatches').get();
    let matchDoc = null;
    snaps.forEach(doc => {
      if (matchDoc) return; // ya lo encontramos
      const d = doc.data();
      let participants = [];
      if (d.type === 'challenge') {
        participants = [
          d.captain1,
          d.captain2,
          ...d.teams.radiant.players,
          ...d.teams.dire.players
        ];
      } else { // start
        participants = [
          ...d.teams.radiant.players,
          ...d.teams.dire.players
        ];
      }
      if (participants.includes(profile.id)) {
        matchDoc = doc;
      }
    });
    if (!matchDoc) {
      return message.channel.send('❌ No active match to report.');
    }
    const matchId = matchDoc.id;
    const match   = matchDoc.data();

    // 4) Delegate to matchService.submitResult, pasándole el matchId
    //    Nota: para challenge, captainId debe ser profile.id; para start, también.
    const res = await matchService.submitResult(
      profile.id,
      profile.id,
      resultTeam,
      matchId
    );

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

    // 5) Formatear respuesta según tipo y estado
    if (match.type === 'challenge') {
      // el método retorna { matchId, winner }
      return message.channel.send(
        `🏆 Match result recorded: **${res.winner.toUpperCase()}** wins!\n` +
        `Challenge closed.\n` +
        `Match ID: \`${res.matchId}\`\n` +
        `Review with \`!info <matchId>\``
      );
    } else {
      // start match: puede ser pending o finalized
      if (res.status === 'pending') {
        // res.votes = { radiant: [...], dire: [...] }
        const r = res.votes.radiant;
        const d = res.votes.dire;
        const line = 
          `✅ Your vote for **${resultTeam.toUpperCase()}** has been recorded!\n\n` +
          `🟢 Radiant (${r.length} vote${r.length!==1?'s':''}): ` +
            (r.length ? r.map(id=>`\`${id}\``).join(', ') : '—') + '\n' +
          `🔴 Dire    (${d.length} vote${d.length!==1?'s':''}): ` +
            (d.length ? d.map(id=>`\`${id}\``).join(', ') : '—');
        return message.channel.send(line);
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
