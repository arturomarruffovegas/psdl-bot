// commands/match/sign.js
const playerService   = require('../../services/playerService');
const matchService    = require('../../services/matchService');
const teamPoolService = require('../../services/teamPoolService');

// Read desired start‑match pool size from ENV, default to 10
const POOL_SIZE = process.env.START_POOL_SIZE
  ? parseInt(process.env.START_POOL_SIZE, 10)
  : 10;

module.exports = {
  name: '!sign',
  async execute(message) {
    // 1) who is calling?
    const discordName = message.author.username.toLowerCase();
    const profile     = await playerService.getPlayerProfileByUsername(discordName);
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }
    const userId = profile.id;

    // 2) infinite team‑creation pool has priority
    const infPool = await teamPoolService.getPool();
    if (infPool) {
      const res = await teamPoolService.signToPool(userId);
      if (typeof res === 'string') {
        if (res === 'no-pool')       return message.channel.send('❌ No active team‑creation pool.');
        if (res === 'already-signed') return message.channel.send('⚠️ You are already in that pool.');
      } else {
        return message.channel.send(`✅ Signed into the team‑creation pool (${res.count} signed).`);
      }
    }

    // 3) now the unified match (challenge or start)
    const activeMatch = await matchService.getCurrentMatch();
    if (!activeMatch) {
      return message.channel.send('❌ No active match to sign up for.');
    }

    // 4) challenge‑specific guards
    if (activeMatch.type === 'challenge') {
      // must have been accepted
      if (activeMatch.status !== 'waiting') {
        return message.channel.send(
          '⚠️ Challenge not yet accepted. Please wait for the challenged player to `!accept`.'
        );
      }
      // captains can’t sign themselves
      if ([activeMatch.captain1, activeMatch.captain2].includes(userId)) {
        return message.channel.send('❌ Captains cannot sign into the challenge pool.');
      }
      // once picks began, no more sign‑ups
      const picked = activeMatch.picks.radiant.length + activeMatch.picks.dire.length;
      if (picked > 0) {
        return message.channel.send('⚠️ Picking has already begun—you can no longer sign up.');
      }
    }

    // 5) duplicate sign‑up guard
    if (activeMatch.pool.includes(userId)) {
      return message.channel.send('⚠️ You are already signed up.');
    }

    // 6) try to sign into the pool
    const result = await matchService.signToPool(userId);

    // 7) handle the string error codes
    if (typeof result === 'string') {
      if (result === 'no-match')       return message.channel.send('❌ No active match.');
      if (result === 'already-signed') return message.channel.send('⚠️ You are already signed up.');
      if (result === 'match-ready')    return message.channel.send('⚠️ The match is already ready to start.');
      if (result === 'not-open')       return message.channel.send('⚠️ Challenge is not open for sign‑ups.');
      if (result === 'drafting')       return message.channel.send('⚠️ Draft has already begun.');
      if (result === 'pool-error')     return message.channel.send('❌ Error finalizing the pool.');
    }

    // 8) still filling the pool?
    if (result.status !== 'ready') {
      if (activeMatch.type === 'start') {
        return message.channel.send(
          `✅ You have signed up. Current pool size: ${result.count}/${POOL_SIZE}`
        );
      } else {
        return message.channel.send(
          `✅ You have signed up. Current pool size: ${result.count}`
        );
      }
    }

    // 9) === the pool just filled and match is “ready” ===
    const { teams, finalized } = result;
    const allPlayers = await playerService.fetchAllPlayers();
    const formatTeam = ids => ids
      .map(id => {
        const p = allPlayers.find(u => u.id === id);
        return p
          ? `• \`${p.id}\` — (${p.role.toUpperCase()} - T${p.tier})`
          : `• \`${id}\``;
      })
      .join('\n');

    const lobbySpoiler    = `||\`${finalized.lobbyName}\`||`;
    const passwordSpoiler = `||\`${finalized.password}\`||`;

    return message.channel.send(
      `🎮 **Match Ready!**\n\n` +
      `**Team Radiant:**\n${formatTeam(teams.radiant)}\n\n` +
      `**Team Dire:**\n${formatTeam(teams.dire)}\n\n` +
      `🧩 Lobby: ${lobbySpoiler}\n` +
      `🔐 Password: ${passwordSpoiler}\n\n` +
      `Captains, report the result with \`!result radiant\` or \`!result dire\`.`
    );
  }
};
