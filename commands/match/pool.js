const playerService = require('../../services/playerService');
const matchService  = require('../../services/matchService');

// Read desired start‑match pool size from env, default to 10
const POOL_SIZE = process.env.START_POOL_SIZE
  ? parseInt(process.env.START_POOL_SIZE, 10)
  : 10;

module.exports = {
  name: '!pool',
  async execute(message, args) {
    // 1) Retrieve the unified active match (either challenge or start).
    const currentMatch = await matchService.getCurrentMatch();
    if (!currentMatch) {
      return message.channel.send('⚠️ No active match in progress.');
    }

    const pool = currentMatch.pool || [];
    if (pool.length === 0) {
      return message.channel.send('⚠️ No players have signed up yet.');
    }

    // 2) Fetch all player profiles so we can look up role & tier
    const allPlayers = await playerService.fetchAllPlayers();

    // 3) Build an array of { id, tier, role } and sort by tier (1→5)
    const sorted = pool
      .map(id => {
        const p = allPlayers.find(u => u.id === id);
        return {
          id,
          tier:    p?.tier    ?? Infinity,
          role:    p?.role    ?? 'unknown',
          display: p
            ? `• \`${p.id}\` — (${p.role.toUpperCase()} - T${p.tier})`
            : `• \`${id}\` — (Unknown)`
        };
      })
      .sort((a, b) => a.tier - b.tier);

    // 4) Turn that back into a single string
    const poolDetails = sorted.map(x => x.display).join('\n');

    // 5) Compose the response
    let response;
    if (currentMatch.type === 'challenge') {
      response = `🧩 **Current Challenge Pool (${pool.length})**\n${poolDetails}`;
    } else if (currentMatch.type === 'start') {
      response = `🧩 **Current Start Match Pool (${pool.length}/${POOL_SIZE})**\n${poolDetails}`;
    } else {
      response = '⚠️ Active match has an unrecognized type.';
    }

    return message.channel.send(response);
  }
};