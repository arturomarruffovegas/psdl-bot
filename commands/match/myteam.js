// commands/match/myteam.js
const playerService   = require('../../services/playerService');
const matchService    = require('../../services/matchService');
const teamPoolService = require('../../services/teamPoolService');
const db              = require('../../services/db');

module.exports = {
  name: '!myteam',
  async execute(message) {
    // 1) who is calling
    const discordName = message.author.username.toLowerCase();
    const profile     = await playerService.getPlayerProfileByUsername(discordName);
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }
    const userId = profile.id;

    // 2) Check for active challenge or start match
    const match = await matchService.getCurrentMatch();
    if (match && match.status === 'ready') {
      // CHALLENGE
      if (match.type === 'challenge') {
        const { picks, captain1, captain2 } = match;
        let side, captain;
        if (captain1 === userId || picks.radiant.includes(userId)) {
          side = 'Radiant'; captain = captain1;
        } else if (captain2 === userId || picks.dire.includes(userId)) {
          side = 'Dire';    captain = captain2;
        }
        if (side) {
          const roster = side === 'Radiant'
            ? [captain1, ...picks.radiant]
            : [captain2, ...picks.dire];
          // fetch all players once for roles/tiers
          const all = await playerService.fetchAllPlayers();
          const list = roster.map(id => {
            const p = all.find(x=>x.id===id);
            const crown = id===captain?' 👑':'';
            return p
              ? `• \`${p.id}\`${crown} — (${p.role.toUpperCase()} - T${p.tier})`
              : `• \`${id}\`${crown} — (Unknown)`;
          }).join('\n');
          return message.channel.send(`🛡️ **Your ${side} Team**\n${list}`);
        }
      }

      // START
      if (match.type === 'start') {
        const { teams } = match;
        if (teams.radiant.includes(userId) || teams.dire.includes(userId)) {
          const side = teams.radiant.includes(userId) ? 'Radiant' : 'Dire';
          const roster = side==='Radiant'
            ? teams.radiant
            : teams.dire;
          const all = await playerService.fetchAllPlayers();
          const list = roster.map(id => {
            const p = all.find(x=>x.id===id);
            return p
              ? `• \`${p.id}\` — (${p.role.toUpperCase()} - T${p.tier})`
              : `• \`${id}\` — (Unknown)`;
          }).join('\n');
          return message.channel.send(`🛡️ **Your ${side} Team**\n${list}`);
        }
      }
    }

    // 3) No active “ready” match—check for split‐teams result
    const split = await teamPoolService.getSplitResult();
    if (split) {
      // split is an array of teams: [ [...], [...], ... ]
      for (let i=0; i<split.length; i++) {
        if (split[i].includes(userId)) {
          const all = await playerService.fetchAllPlayers();
          const list = split[i].map(id => {
            const p = all.find(x=>x.id===id);
            return p
              ? `• \`${p.id}\` — (${p.role.toUpperCase()} - T${p.tier})`
              : `• \`${id}\` — (Unknown)`;
          }).join('\n');
          return message.channel.send(`🛡️ **Your Team (Group ${i+1})**\n${list}`);
        }
      }
    }

    return message.channel.send('⚠️ You are not currently on any team.');
  }
};