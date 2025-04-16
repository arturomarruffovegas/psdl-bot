const playerService    = require('../../services/playerService');
const matchService     = require('../../services/matchService');
const teamPoolService  = require('../../services/teamPoolService');

// Read desired start‑match pool size from env, default to 10
const POOL_SIZE = process.env.START_POOL_SIZE
  ? parseInt(process.env.START_POOL_SIZE, 10)
  : 10;

module.exports = {
  name: '!sign',
  async execute(message, args) {
    // 1) Lookup user's internal ID
    const discordName = message.author.username.toLowerCase();
    const profile     = await playerService.getPlayerProfileByUsername(discordName);
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }
    const userId = profile.id;

    // ───────────────────────────────────────────────────────
    // 2) Infinite “create teams” pool takes priority if open
    const infPool = await teamPoolService.getPool();
    if (infPool) {
      // try to sign into the infinite pool
      const res = await teamPoolService.signToPool(userId);
      if (typeof res === 'string') {
        if (res === 'no-pool')       return message.channel.send('❌ No active team‑creation pool.');
        if (res === 'already-signed') return message.channel.send('⚠️ You are already in that pool.');
      } else {
        return message.channel.send(`✅ Signed into the team‑creation pool (${res.count} signed).`);
      }
    }
    // ───────────────────────────────────────────────────────

    // 3) Fetch the current unified match (challenge or start)
    const activeMatch = await matchService.getCurrentMatch();
    if (!activeMatch) {
      return message.channel.send('❌ No active match to sign up for.');
    }

    // 4) Challenge‑specific guards
    if (activeMatch.type === 'challenge') {
      // 4a) Must be accepted first
      if (activeMatch.status !== 'waiting') {
        return message.channel.send(
          '⚠️ Challenge not yet accepted. Please wait for the challenged player to `!accept`.'
        );
      }
      // 4b) Captains may not sign
      if (userId === activeMatch.captain1 || userId === activeMatch.captain2) {
        return message.channel.send('❌ Captains cannot sign into the challenge pool.');
      }
      // 4c) Once picks start, no more sign‑ups
      const { picks } = activeMatch;
      if (picks.radiant.length + picks.dire.length > 0) {
        return message.channel.send('⚠️ Picking has already begun—you can no longer sign up.');
      }
    }

    // 5) Prevent duplicate sign‑ups
    if (activeMatch.pool.includes(userId)) {
      return message.channel.send('⚠️ You are already signed up.');
    }

    // 6) Attempt to sign into the (challenge or start) pool
    const result = await matchService.signToPool(userId);

    // 7) Handle string error codes
    if (typeof result === 'string') {
      if (result === 'no-match')       return message.channel.send('❌ No active match.');
      if (result === 'already-signed') return message.channel.send('⚠️ You are already signed up.');
      if (result === 'pool-full')      return message.channel.send('⚠️ The start match pool is already full.');
      if (result === 'pool-error')     return message.channel.send('❌ An error occurred finalizing the pool.');
    }

    // 8) If pool still filling, show correct count formatting
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

    // 9) === MATCH FINALIZED ===
    const { teams, finalized } = result;

    // fetch all players for lookup
    const allPlayers = await playerService.fetchAllPlayers();
    // format each team member with role and tier
    const formatTeam = ids => ids
      .map(id => {
        const p = allPlayers.find(u => u.id === id);
        return p
          ? `• \`${p.id}\` — (${p.role.toUpperCase()} - T${p.tier})`
          : `• \`${id}\``;
      })
      .join('\n');

    // Wrap lobby info in spoilers
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
