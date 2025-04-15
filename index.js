require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const db = require('./firebase');
const ADMIN_IDS = process.env.ADMIN_IDS.split(',');
const challenge = require('./challenge');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// 🔧 Helpers
const formatList = (list) =>
    list.map(p => `• \`${p.id}\` — (${p.role.toUpperCase()} - T${p.tier})`).join('\n');

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

async function fetchAllPlayers() {
    const snapshot = await db.collection('players').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getPlayerProfileById(userId) {
    const doc = await db.collection('players').doc(userId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function getPlayerProfileByDiscordTag(discordTag) {
    const snapshot = await db.collection('players')
        .where('discordTag', '==', discordTag)
        .limit(1)
        .get();

    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

async function registerPlayer(userId, data) {
    const existing = await db.collection('players').doc(userId).get();
    if (existing.exists) return false;

    await db.collection('players').doc(userId).set({
        ...data,
        registeredAt: new Date().toISOString()
    });
    return true;
}

async function unregisterPlayer(userId) {
    await db.collection('players').doc(userId).delete();
}

async function updatePlayer(userId, updates) {
    await db.collection('players').doc(userId).update(updates);
}

// ✅ Bot Ready
client.on('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
});

// 💬 Command Handling
client.on('messageCreate', async message => {
    const content = message.content.toLowerCase();
    if (message.author.bot) return;

    // 📖 Help
    if (content === '!help') {
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
        🔸 \`!register <userId> <dotaId> "<Full Name>" <email> <discordTag> <role> <tier>\` — Register a player  
        🔸 \`!update <userId> <field> <value>\` — Update player info  
        🔸 \`!unregister <userId>\` — Remove player from database  
        🔸 \`!activate <userId>\` — Mark player as active  
        🔸 \`!deactivate <userId>\` — Mark player as inactive`);
    }

    // 📋 All players
    if (content === '!players') {
        const all = (await fetchAllPlayers()).filter(p => p.active !== false);
        if (all.length === 0) return message.channel.send(`⚠️ No registered players found.`);
        return message.channel.send(`📋 **Registered Players (${all.length})**\n${formatList(all)}`);
    }

    // 🎯 Tier filter
    if (content.startsWith('!players t')) {
        const tier = parseInt(content.split('t')[1]);
        const all = (await fetchAllPlayers()).filter(p => p.active !== false);
        const filtered = all.filter(p => p.tier === tier);
        if (filtered.length === 0) return message.channel.send(`⚠️ No players found in Tier ${tier}.`);
        return message.channel.send(`🎯 **Tier ${tier} Players (${filtered.length})**\n${formatList(filtered)}`);
    }

    // 🔥 Cores
    if (content === '!cores') {
        const all = (await fetchAllPlayers()).filter(p => p.active !== false);
        const cores = all.filter(p => p.role === 'core');
        if (cores.length === 0) return message.channel.send(`⚠️ No core players found.`);
        return message.channel.send(`🔥 **Cores (${cores.length})**\n${formatList(cores)}`);
    }

    // 🛡 Supports
    if (content === '!supports') {
        const all = (await fetchAllPlayers()).filter(p => p.active !== false);
        const supports = all.filter(p => p.role === 'support');
        if (supports.length === 0) return message.channel.send(`⚠️ No support players found.`);
        return message.channel.send(`🛡️ **Supports (${supports.length})**\n${formatList(supports)}`);
    }

    // 🧪 Teams
    if (content === '!teams') {
        const all = (await fetchAllPlayers()).filter(p => p.active !== false);
        const cores = shuffle(all.filter(p => p.role === 'core')).slice(0, 6);
        const supports = shuffle(all.filter(p => p.role === 'support')).slice(0, 4);

        if (cores.length < 6 || supports.length < 4) {
            return message.channel.send(`⚠️ Not enough players to create balanced teams.`);
        }

        const radiant = [...cores.slice(0, 3), ...supports.slice(0, 2)];
        const dire = [...cores.slice(3, 6), ...supports.slice(2, 4)];

        return message.channel.send(
            `🟢 **Radiant Team**\n${formatList(radiant)}\n\n🔴 **Dire Team**\n${formatList(dire)}`
        );
    }

    // 🧾 Profile (self)
    if (content.startsWith('!profile')) {
        const args = message.content.trim().split(/\s+/);

        // !profile <userId> — show another player's profile
        if (args.length === 2) {
            const userId = args[1];
            const player = await getPlayerProfileById(userId);
            if (!player) {
                return message.channel.send(`❌ No player found with ID \`${userId}\`.`);
            }

            const profile = `🧾 **Profile for \`${userId}\`**
    • **Name**: ${player.name}
    • **Email**: ${player.email}
    • **Discord Tag**: ${player.discordTag ?? 'N/A'}
    • **Dota ID**: ${player.dotaId}
    • **Role**: ${player.role.toUpperCase()}
    • **Tier**: T${player.tier}
    • **Points**: ${player.points ?? 0}
    • **Since**: <t:${Math.floor(new Date(player.registeredAt).getTime() / 1000)}:F>`;
            return message.channel.send(profile);
        }

        // !profile — show own profile using discordTag
        const player = await getPlayerProfileByDiscordTag(message.author.tag);
        if (!player) {
            return message.channel.send(`❌ You are not registered.`);
        }

        const profile = `🧾 **Your Profile**
    • **Name**: ${player.name}
    • **Email**: ${player.email}
    • **User ID**: \`${player.id}\`
    • **Dota ID**: ${player.dotaId}
    • **Role**: ${player.role.toUpperCase()}
    • **Tier**: T${player.tier}
    • **Points**: ${player.points ?? 0}
    • **Since**: <t:${Math.floor(new Date(player.registeredAt).getTime() / 1000)}:F>`;

        return message.channel.send(profile);
    }

    if (content.startsWith('!challenge')) {
        const args = message.content.trim().split(/\s+/);
        if (args.length !== 2) return message.channel.send('❌ Usage: `!challenge <userId>`');

        const challengedId = args[1].trim();

        const challengerProfile = await getPlayerProfileByDiscordTag(message.author.tag);
        const challengedProfile = await getPlayerProfileById(challengedId);

        console.log(challengerProfile);
        console.log(challengedProfile);

        if (!challengerProfile || !challengedProfile) {
            return message.channel.send('❌ Both you and the challenged player must be registered.');
        }

        if (challengerProfile.id === challengedProfile.id) {
            return message.channel.send('❌ You cannot challenge yourself.');
        }

        try {
            console.log('ChallengerProfileId', challengerProfile.id, 'ChallengeProfileId', challengedProfile.id);
            const result = await challenge.createChallenge(challengerProfile.id, challengedProfile.id);

            if (!result) {
                return message.channel.send('⚠️ A challenge is already in progress. Use `!abort` to cancel it.');
            }

            return message.channel.send(
                `⚔️ **${challengerProfile.id}** has challenged **${challengedProfile.id}**!\n👉 **${challengedProfile.id}**, type \`!accept\` to begin or \`!reject\` to cancel.`
            );
        } catch (err) {
            console.error('[CHALLENGE] Failed to create challenge:', err);
            return message.channel.send('❌ An error occurred while creating the challenge.');
        }
    }

    if (content === '!sign') {
        const user = await getPlayerProfileByDiscordTag(message.author.tag);
        if (!user) return message.channel.send('❌ You are not registered.');

        const current = await db.collection('challenges').doc('current').get();
        if (current.exists) {
            const { captain1, captain2 } = current.data();
            if ([captain1, captain2].includes(user.id)) {
                return message.channel.send('❌ Captains cannot sign into the player pool.');
            }
        }

        const result = await challenge.signToPool(user.id);
        if (result === 'no-challenge') return message.channel.send('❌ No active challenge.');
        if (result === 'already-signed') return message.channel.send('⚠️ You are already signed up.');
        if (result === 'already-in-game') return message.channel.send(`❌ You are already in a match that hasn't been resolved.`);

        return message.channel.send(`✅ \`${user.id}\` joined the challenge pool.`);
    }

    if (content === '!pool') {
        const pool = await challenge.getCurrentPool();
        if (pool.length === 0) return message.channel.send('⚠️ No players have signed up yet.');

        const allPlayers = await fetchAllPlayers();
        const poolDetails = pool.map(id => {
            const p = allPlayers.find(u => u.id === id);
            return p
                ? `• \`${p.id}\` (${p.role.toUpperCase()} - T${p.tier})`
                : `• \`${id}\` (Unknown)`;
        });

        return message.channel.send(`🧩 **Current Pool (${pool.length}/10)**\n${poolDetails.join('\n')}`);
    }

    if (content === '!abort') {
        const success = await challenge.abortChallenge();
        if (!success) return message.channel.send('⚠️ No active challenge to abort.');

        return message.channel.send('🛑 The current challenge has been **aborted**.');
    }

    if (content.startsWith('!pick')) {
        const args = message.content.trim().split(/\s+/);
        if (args.length !== 2) return message.channel.send('❌ Usage: `!pick <userId>`');

        const user = await getPlayerProfileByDiscordTag(message.author.tag);
        if (!user) return message.channel.send('❌ You are not registered.');

        const pickId = args[1];
        const result = await challenge.pickPlayer(user.id, pickId);

        if (result.error === 'no-challenge') return message.channel.send('❌ No active challenge.');
        if (result.error === 'not-captain') return message.channel.send('❌ Only captains can pick players.');
        if (result.error === 'not-your-turn') return message.channel.send('⚠️ It is not your turn to pick.');
        if (result.error === 'not-in-pool') return message.channel.send('⚠️ That player is not in the pool.');

        const summary = `✅ \`${pickId}\` has been picked for the **${result.team} Team**.`;

        if (result.finalized) {
            const ref = db.collection('challenges').doc('current');
            const snapshot = await ref.get();
            const picks = snapshot.data().picks;

            const formatTeam = (team, label) => `**${label} Team**\n${team.map(id => `• \`${id}\``).join('\n')}`;

            return message.channel.send(
                `${summary}\n\n🎮 **Match Ready!**\n🟢 ${formatTeam(picks.radiant, 'Radiant')}\n\n🔴 ${formatTeam(picks.dire, 'Dire')}\n\n🧩 Lobby: \`${result.finalized.lobbyName}\`\n🔐 Password: \`${result.finalized.password}\`\n\nCaptains must report result using \`!result radiant\` or \`!result dire\`.`
            );
        }

        return message.channel.send(summary);
    }

    if (content.startsWith('!result')) {
        const args = message.content.trim().split(/\s+/);
        if (args.length !== 2) return message.channel.send('❌ Usage: `!result radiant` or `!result dire`');

        const team = args[1].toLowerCase();
        const user = await getPlayerProfileByDiscordTag(message.author.tag);
        if (!user) return message.channel.send('❌ You are not registered.');

        const result = await challenge.submitResult(user.id, team);

        if (result.error) {
            if (result.error === 'no-challenge') return message.channel.send('❌ No active match to resolve.');
            if (result.error === 'not-captain') return message.channel.send('❌ Only captains can report match results.');
            if (result.error === 'invalid-team') return message.channel.send('❌ Invalid result team. Use `radiant` or `dire`.');
            if (result.error === 'match-not-found') return message.channel.send('⚠️ Match not found in records.');
        }

        return message.channel.send(`🏆 Match result recorded: **${team.toUpperCase()}** wins!\nChallenge closed.\nMatch ID: \`${result.matchId}\`\nYou can review it with \`!results ${result.matchId}\``);
    }

    if (content.startsWith('!results')) {
        const args = message.content.trim().split(/\s+/);
        if (args.length !== 2) return message.channel.send('❌ Usage: `!results <matchId>`');

        const matchId = args[1];
        const ref = await db.collection('matches').doc(matchId).get();

        if (!ref.exists) return message.channel.send(`❌ Match \`${matchId}\` not found.`);

        const match = ref.data();
        const formatTeam = (team, name) => `**${name}** (Captain: \`${team.captain}\`)\n${team.players.map(p => `• \`${p}\``).join('\n')}`;

        return message.channel.send(
            `📜 **Match \`${matchId}\`**\n` +
            `🕓 Played at: <t:${Math.floor(new Date(match.createdAt).getTime() / 1000)}:F>\n\n` +
            `${formatTeam(match.radiant, 'Radiant Team')}\n\n` +
            `${formatTeam(match.dire, 'Dire Team')}\n\n` +
            `🏆 **Winner**: ${match.winner ? `\`${match.winner.toUpperCase()}\`` : '`Pending Result`'}\n` +
            `🧩 Lobby: \`${match.lobbyName}\`\n🔐 Password: \`${match.password}\``
        );
    }

    if (content === '!accept' || content === '!reject') {
        const snapshot = await db.collection('challenges').doc('current').get();
        if (!snapshot.exists) return message.channel.send('⚠️ There is no pending challenge.');

        const challengeData = snapshot.data();

        if (challengeData.status !== 'pending') {
            return message.channel.send('⚠️ This challenge has already been accepted or started.');
        }

        if (!challengeData.captain2) return message.channel.send('⚠️ This challenge is missing a challenged player.');

        const player = await getPlayerProfileByDiscordTag(message.author.tag);

        if (!player || player.id !== challengeData.captain2) {
            return message.channel.send('❌ Only the challenged player can accept or reject this challenge.');
        }

        if (content === '!reject') {
            await db.collection('challenges').doc('current').delete();
            return message.channel.send(`❌ Challenge was rejected by \`${player.id}\`. Challenge cancelled.`);
        }

        if (content === '!accept') {
            await db.collection('challenges').doc('current').update({ status: 'waiting' });
            return message.channel.send(`✅ Challenge accepted by \`${player.id}\`! Players can now join the pool using \`!sign\`.`);
        }
    }

    // 📝 Admin: Register
    if (content.startsWith('!register')) {
        if (!ADMIN_IDS.includes(message.author.id)) {
            console.log('[REGISTER] Unauthorized user:', message.author.id);
            return;
        }

        console.log('[REGISTER] Raw message content:', message.content);

        const registerRegex = /^!register\s+(\S+)\s+(\S+)\s+"([^"]+)"\s+(\S+)\s+(\S+)\s+(core|support)\s+([1-5])$/i;
        const match = message.content.match(registerRegex);

        if (!match) {
            console.log('[REGISTER] Regex match failed');
            return message.channel.send(`❌ Invalid format.\nUse: \`!register <userId> <dotaId> "<Full Name>" <email> <discordTag> <core|support> <tier 1-5>\``);
        }

        const [, userId, dotaId, name, email, discordTag, role, tierStr] = match;
        const tier = parseInt(tierStr);

        console.log('[REGISTER] Parsed values:', {
            userId, dotaId, name, email, discordTag, role, tier
        });

        try {
            const success = await registerPlayer(userId, {
                registeredBy: message.author.tag,
                userId,
                dotaId,
                name,
                email,
                discordTag,
                role: role.toLowerCase(),
                tier,
                points: 1000,
                active: true
            });

            if (!success) {
                console.log('[REGISTER] Duplicate userId:', userId);
                return message.channel.send(`❌ That userId already exists. Choose a unique one.`);
            }

            console.log('[REGISTER] Registration successful for:', userId);
            message.channel.send(`✅ **${name}** registered as ${role.toUpperCase()} (T${tier}) with Discord tag \`${discordTag}\`.`);
        } catch (err) {
            console.error('[REGISTER] Registration error:', err);
            message.channel.send(`❌ Registration failed. Try again.`);
        }
    }

    // 🔁 Admin: Update
    if (content.startsWith('!update')) {
        if (!ADMIN_IDS.includes(message.author.id)) {
            console.log('[REGISTER] Unauthorized user:', message.author.id);
            return;
        }

        const parts = message.content.split(' ');
        if (parts.length !== 4) {
            return message.channel.send(`❌ Use: \`!update <userId> <field> <value>\``);
        }

        const [, userId, field, value] = parts;
        const validFields = ['name', 'email', 'role', 'tier', 'points'];

        if (!validFields.includes(field)) {
            return message.channel.send(`❌ Invalid field. Use one of: \`${validFields.join(', ')}\``);
        }

        const update = {};
        update[field] = ['tier', 'points'].includes(field) ? parseInt(value) : value;

        console.log('[UPDATE] Attempting update:', { userId, field, value });

        try {
            await updatePlayer(userId, update);
            console.log('[UPDATE] Success for user:', userId);
            message.channel.send(`✅ Updated \`${userId}\` → \`${field}\` to \`${value}\`.`);
        } catch (err) {
            console.error('[UPDATE] Failed for user:', userId, err);
            message.channel.send(`❌ Failed to update user.`);
        }
    }


    // ❌ Admin: Unregister
    if (content.startsWith('!unregister')) {
        if (!ADMIN_IDS.includes(message.author.id)) {
            console.log('[REGISTER] Unauthorized user:', message.author.id);
            return;
        }

        const parts = message.content.split(' ');
        if (parts.length !== 2) {
            return message.channel.send(`❌ Use: \`!unregister <userId>\``);
        }

        const [, userId] = parts;
        console.log('[UNREGISTER] Attempting to delete user:', userId);

        try {
            await unregisterPlayer(userId);
            console.log('[UNREGISTER] Success for user:', userId);
            message.channel.send(`🗑️ Player \`${userId}\` removed from the database.`);
        } catch (err) {
            console.error('[UNREGISTER] Failed for user:', userId, err);
            message.channel.send(`❌ Failed to unregister user.`);
        }
    }

    if (content.startsWith('!activate')) {
        if (!ADMIN_IDS.includes(message.author.id)) {
            console.log('[REGISTER] Unauthorized user:', message.author.id);
            return;
        }

        const parts = message.content.split(' ');
        if (parts.length !== 2) {
            return message.channel.send(`❌ Use: \`!activate <userId>\``);
        }

        const [, userId] = parts;
        try {
            await updatePlayer(userId, { active: true });
            console.log('[ACTIVATE] User activated:', userId);
            message.channel.send(`✅ \`${userId}\` marked as **active**.`);
        } catch (err) {
            console.error('[ACTIVATE] Failed:', err);
            message.channel.send(`❌ Failed to activate user.`);
        }
    }

    if (content.startsWith('!deactivate')) {
        if (!ADMIN_IDS.includes(message.author.id)) {
            console.log('[REGISTER] Unauthorized user:', message.author.id);
            return;
        }

        const parts = message.content.split(' ');
        if (parts.length !== 2) {
            return message.channel.send(`❌ Use: \`!deactivate <userId>\``);
        }

        const [, userId] = parts;
        try {
            await updatePlayer(userId, { active: false });
            console.log('[DEACTIVATE] User deactivated:', userId);
            message.channel.send(`⚠️ \`${userId}\` marked as **inactive**.`);
        } catch (err) {
            console.error('[DEACTIVATE] Failed:', err);
            message.channel.send(`❌ Failed to deactivate user.`);
        }
    }
});

client.login(process.env.DISCORD_TOKEN);