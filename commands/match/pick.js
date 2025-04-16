const playerService = require('../../services/playerService');
const matchService  = require('../../services/matchService');
const db            = require('../../services/db');

module.exports = {
  name: '!pick',
  async execute(message, args) {
    if (args.length !== 1) {
      return message.channel.send('❌ Usage: `!pick <userId>`');
    }
    const pickId = args[0].trim();
    const profile = await playerService.getPlayerProfileByUsername(message.author.username);
    if (!profile) return message.channel.send('❌ You are not registered.');

    const result = await matchService.pickPlayer(profile.id, pickId);
    if (result.error) {
      if (result.error === 'no-match')      return message.channel.send('❌ No active challenge match.');
      if (result.error === 'not-captain')   return message.channel.send('❌ Only captains can pick players.');
      if (result.error === 'not-your-turn') return message.channel.send('⚠️ It is not your turn to pick.');
      if (result.error === 'not-in-pool')   return message.channel.send('⚠️ That player is not in the pool.');
      return message.channel.send('❌ An error occurred during picking.');
    }

    const summary = `✅ \`${pickId}\` has been picked for the **${result.team} Team**.`;

    if (result.finalized) {
      const snapshot = await db.collection('matches').doc('current').get();
      const data     = snapshot.data();
      const picks    = data.picks;

      // Fetch all players once for role/tier lookups
      const allPlayers = await playerService.fetchAllPlayers();

      // Format team members with role and tier, crown for captains
      const formatTeam = (players, label, captainId) => {
        return `**${label} Team**\n` +
          [captainId, ...players].map(id => {
            const p     = allPlayers.find(u => u.id === id);
            const crown = id === captainId ? ' 👑' : '';
            return p
              ? `• \`${p.id}\`${crown} — (${p.role.toUpperCase()} - T${p.tier})`
              : `• \`${id}\`${crown}`;
          }).join('\n');
      };

      // Wrap lobby and password in Discord spoiler tags
      const lobbySpoiler    = `||\`${result.finalized.lobbyName}\`||`;
      const passwordSpoiler = `||\`${result.finalized.password}\`||`;

      return message.channel.send(
        `${summary}\n\n🎮 **Match Ready!**\n` +
        `🟢 ${formatTeam(picks.radiant, 'Radiant', data.captain1)}\n\n` +
        `🔴 ${formatTeam(picks.dire,    'Dire',    data.captain2)}\n\n` +
        `🧩 Lobby: ${lobbySpoiler}\n` +
        `🔐 Password: ${passwordSpoiler}\n` +
        `Captains must now report the result using \`!result radiant\` or \`!result dire\`.`
      );
    }

    // Otherwise, indicate whose turn is next.
    const snapshot    = await db.collection('matches').doc('current').get();
    const data        = snapshot.data();
    const nextCaptain = result.team === 'Radiant' ? data.captain2 : data.captain1;
    return message.channel.send(`${summary}\n🎯 **${nextCaptain}**, it's your turn to pick.`);
  }
};
