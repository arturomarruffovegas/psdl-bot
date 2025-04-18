// commands/help.js
module.exports = {
  name: '!help',
  async execute(msg) {
    return msg.channel.send(`
**🎯 Challenge Commands**
• \`!challenge <userId>\` — Initiate a captain‑pick match.
• \`!accept\` / \`!reject\` — Respond to a pending challenge.
• \`!sign\` — Join an open challenge or start match pool.
• \`!unsign\` — Leave the pool before drafting or start.
• \`!pool\` — View the current pool of sign‑ups.
• \`!pick <userId>\` — (Challenge only) Captains pick players.
• \`!abort\` — Cancel the current match in pre‑game.
• \`!result <radiant|dire>\` — (Challenge) Report the winner.

**🏁 Start Match Commands**
• \`!start\` — Open a pickup‑style match; creator auto‑signs.
• \`!sign\` — Join the start match pool.
• \`!unsign\` — Leave before the start pool fills.
• \`!pool\` — View pool count (e.g. 3/10).
• \`!abort\` — Cancel the start match.
• \`!result <radiant|dire>\` — (Start) Vote; 6 votes finalize.

**ℹ️ Info & Utility**
• \`!info <matchId>\` — Show finalized match details.
• \`!teams\` — Show teams for any ongoing match you’re in.
• \`!current\` — List all ongoing matches.
• \`!version\` — Show the bot’s current version.
• \`!nova\` — “Catch me on streaming at kick.com/novadota”.

**👥 Player Directory**
• \`!players\` — List all registered players.
• \`!players t<N>\` — Filter by tier (e.g. t1, t2…).
• \`!cores\` / \`!supports\` — List by role.
• \`!profile [<userId>]\` — Show your or another’s profile.
• \`!points <userId>\` — Show a player’s point total.

**🛠️ Admin Commands**
• \`!register <userId> <dotaId> "<Full Name>" <email> <discordTag> <core|support> <tier>\`  
• \`!unregister <userId>\`  
• \`!activate <userId>\` / \`!deactivate <userId>\`  
• \`!update <userId> <field> <value>\` — name, email, role, tier, points.

If I missed any commands (or you’d like them re‑grouped), let me know!`);
  }
};