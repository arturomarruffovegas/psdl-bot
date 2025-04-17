// commands/match/last10.js
const playerService = require('../../services/playerService');
const db = require('../../services/db');

module.exports = {
  name: '!last10',
  async execute(message) {
    // 1) Make sure you’re registered
    const profile = await playerService.getPlayerProfileByUsername(
      message.author.username.toLowerCase()
    );
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }
    const userId = profile.id;

    const entries = [];

    // 2) Pull recent challenge matches from `matches`
    const challengeSnaps = await db
      .collection('matches')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    challengeSnaps.docs.forEach((doc) => {
      const data = doc.data();
      const participants = [
        data.radiant?.captain,
        ...(data.radiant?.players || []),
        data.dire?.captain,
        ...(data.dire?.players || []),
      ];
      if (participants.includes(userId)) {
        entries.push({ id: doc.id, ts: data.createdAt });
      }
    });

    // 3) Pull recent start matches from `finalizedMatches`
    const startSnaps = await db
      .collection('finalizedMatches')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    startSnaps.docs.forEach((doc) => {
      const data = doc.data();
      const participants = [
        ...(data.radiant?.players || []),
        ...(data.dire?.players || []),
      ];
      if (participants.includes(userId)) {
        entries.push({ id: doc.id, ts: data.createdAt });
      }
    });

    // 4) Sort by timestamp, dedupe, and take up to 10
    entries.sort((a, b) => new Date(b.ts) - new Date(a.ts));
    const seen = new Set();
    const lastIds = [];
    for (const e of entries) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        lastIds.push(e.id);
        if (lastIds.length === 10) break;
      }
    }

    if (!lastIds.length) {
      return message.channel.send('⚠️ No recorded matches found.');
    }

    // 5) Reply with the list
    return message.channel.send(
      `🕹️ **Your last ${lastIds.length} matches:**\n` +
      lastIds.map(id => `• \`${id}\``).join('\n')
    );
  },
};
