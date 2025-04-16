const playerService = require('../services/playerService');
const matchService  = require('../services/matchService');

module.exports = {
  name: '!teams',
  async execute(msg) {
    // Fetch the unified current match (challenge or start)
    const match = await matchService.getCurrentMatch();
    if (!match) {
      return msg.channel.send('⚠️ No active match.');
    }

    let radiantIds = [];
    let direIds    = [];
    let crownId    = null;

    if (match.type === 'challenge') {
      // Challenge: captains + picks
      radiantIds = [match.captain1, ...match.picks.radiant];
      direIds    = [match.captain2, ...match.picks.dire];
      crownId    = {
        radiant: match.captain1,
        dire:    match.captain2
      };
    } else if (match.type === 'start') {
      // Start: teams must be ready
      if (match.status !== 'ready' || !match.teams) {
        return msg.channel.send('⚠️ Start match is not ready yet.');
      }
      radiantIds = match.teams.radiant;
      direIds    = match.teams.dire;
    }

    const all = await playerService.fetchAllPlayers();
    const fmt = (ids, side) =>
      ids.map(id => {
        const p = all.find(x => x.id === id);
        const crown = crownId && crownId[side] === id ? ' 👑' : '';
        return p
          ? `• \`${p.id}\`${crown} — (${p.role.toUpperCase()}-T${p.tier})`
          : `• \`${id}\`${crown} — (Unknown)`;
      }).join('\n');

    return msg.channel.send(
      `🟢 **Radiant Team**\n${fmt(radiantIds, 'radiant')}\n\n` +
      `🔴 **Dire Team**\n${fmt(direIds,    'dire')}`
    );
  }
};
