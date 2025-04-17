// commands/last10.js
const playerService = require('../services/playerService');
const db            = require('../services/db');

module.exports = {
  name: '!last10',
  async execute(message) {
    // 1) Lookup the user’s internal ID.
    const profile = await playerService.getPlayerProfileByUsername(
      message.author.username.toLowerCase()
    );
    if (!profile) {
      return message.channel.send('❌ You are not registered.');
    }
    const userId = profile.id;

    // 2) Query the finalizedMatches archive for any games you participated in.
    const fm = db.collection('finalizedMatches');
    const [radSnap, direSnap] = await Promise.all([
      fm.where('radiant.players', 'array-contains', userId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get(),
      fm.where('dire.players', 'array-contains', userId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get()
    ]);

    // 3) Merge & dedupe, then sort by date desc and take up to 10.
    const allDocs = [...radSnap.docs, ...direSnap.docs];
    const uniq = new Map();
    allDocs.forEach(doc => uniq.set(doc.id, doc));
    const latest = Array.from(uniq.values())
      .sort((a, b) =>
        new Date(b.data().createdAt) - new Date(a.data().createdAt)
      )
      .slice(0, 10);

    if (latest.length === 0) {
      return message.channel.send('⚠️ You have no recorded matches.');
    }

    // 4) Build the reply listing match IDs (and optional winner).
    const lines = latest.map(doc => {
      const data = doc.data();
      const win  = data.winner ? data.winner.toUpperCase() : 'PENDING';
      return `• \`${doc.id}\` (${win})`;
    });

    return message.channel.send(
      `📜 **Your Last ${lines.length} Matches:**\n${lines.join('\n')}`
    );
  }
};
