module.exports = {
   name: '!help',
   async execute(msg) {
     return msg.channel.send(`
  **Challenge Commands**
  • \`!challenge <userId>\` — Initiate a captain‑pick match against another player.
  • \`!accept\` / \`!reject\` — The challenged player accepts or declines a pending challenge.
  • \`!sign\` — Join the current challenge pool once it's accepted.
  • \`!unsign\` — Leave the challenge pool before picks begin.
  • \`!pool\` — View who is signed up (with roles/tiers).
  • \`!pick <userId>\` — (Challenge only) Captains alternate picking players from the pool.
  • \`!abort\` — Cancel the current challenge.
  • \`!result <radiant|dire>\` — Report the winning side of the match.
 
  **Start Commands**
  • \`!start\` — Open a pickup‑style match; creator is auto‑signed and waits for the pool to fill.
  • \`!sign\` — Join the open start match pool.
  • \`!unsign\` — Leave the start match pool before it fills.
  • \`!pool\` — View the current start match pool and its count (e.g. 3/10).
  • \`!abort\` — Cancel the start match before it fills.
  • \`!result <radiant|dire>\` — (Start only) Vote on which side won; 6 votes finalize.
 
  **General Commands**
  • \`!info <matchId>\` — Get final match details (teams, lobby, password, winner).
  • \`!teams\` — Show current team composition for an ongoing match.
  • \`!players\`, \`!players t<N>\`, \`!cores\`, \`!supports\` — List registered players (with optional tier or role filters).
  • \`!profile [<userId>]\` — View your or another player’s profile.
 
  **Admin Commands**
  • \`!register <userId> <dotaId> "<Full Name>" <email> <discordTag> <core|support> <tier>\` — Add a new player.
  • \`!unregister <userId>\` — Remove a player from the database.
  • \`!activate <userId>\`, \`!deactivate <userId>\` — Toggle a player’s active status.
  • \`!update <userId> <field> <value>\` — Update a player’s name, email, role, tier, or points.
  `);
   }
 };