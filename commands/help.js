module.exports = {
    name: '!help',
    async execute(message) {
        return message.channel.send(`📖 **Available Commands**
        
👤 **User Commands**
🔹 \`!help\` — Show this help message  
🔹 \`!players\` — List all registered players  
🔹 \`!players t<number>\` — Filter players by tier (e.g. \`!players t2\`)  
🔹 \`!cores\` — List all core players  
🔹 \`!supports\` — List all support players  
🔹 \`!teams\` — Generate 5v5 Radiant vs Dire teams randomly  
🔹 \`!profile\` — View your own registered profile  
🔹 \`!profile <userId>\` — View another player’s profile  
🔹 \`!challenge <userId>\` — Challenge another player to start a match  
🔹 \`!accept\` / \`!reject\` — Respond to a challenge  
🔹 \`!sign\` — Sign up for the current challenge pool  
🔹 \`!pool\` — View the current signed player pool  
🔹 \`!pick <userId>\` — Captains pick players from the pool  
🔹 \`!result <radiant|dire>\` — Submit the match result  
🔹 \`!results <matchId>\` — View details of a previous match

🛠️ **Admin Commands**
🔸 \`!register <userId> <dotaId> "<Full Name>" <email> <discordTag> <core|support> <tier>\` — Register a player  
🔸 \`!update <userId> <field> <value>\` — Update player info  
🔸 \`!unregister <userId>\` — Remove player from database  
🔸 \`!activate <userId>\` — Mark player as active  
🔸 \`!deactivate <userId>\` — Mark player as inactive`);
    }
};