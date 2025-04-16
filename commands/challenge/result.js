const playerService = require('../../services/playerService');
const db = require('../../services/db');

module.exports = {
    name: '!result',
    async execute(message, args) {
        if (args.length !== 1) {
            return message.channel.send('❌ Usage: `!result <radiant|dire>`');
        }

        const resultTeam = args[0].toLowerCase();
        if (!['radiant', 'dire'].includes(resultTeam)) {
            return message.channel.send('❌ Invalid team. Use `radiant` or `dire`.');
        }

        const user = await playerService.getPlayerProfileByUsername(message.author.username);
        if (!user) return message.channel.send('❌ You are not registered.');

        const matchSnap = await db.collection('matches')
            .where('winner', '==', null)
            .orderBy('createdAt', 'desc')
            .get();

        const matches = matchSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(m => [m.radiant.captain, m.dire.captain].includes(user.id));

        if (matches.length === 0) {
            return message.channel.send('⚠️ No active match to resolve.');
        }

        const match = matches[0]; // Most recent one
        const matchId = match.id;

        if (![match.radiant.captain, match.dire.captain].includes(user.id)) {
            return message.channel.send('❌ Only captains can report match results.');
        }

        // Update result
        await db.collection('matches').doc(matchId).update({ winner: resultTeam });

        const winnerTeam = match[resultTeam];
        const loserTeam = match[resultTeam === 'radiant' ? 'dire' : 'radiant'];
        const pointDelta = 25;

        const batch = db.batch();

        for (const pid of winnerTeam.players.concat(winnerTeam.captain)) {
            const ref = db.collection('players').doc(pid);
            const snap = await ref.get();
            if (snap.exists) {
                const points = snap.data().points || 1000;
                batch.update(ref, { points: points + pointDelta });
            }
        }

        for (const pid of loserTeam.players.concat(loserTeam.captain)) {
            const ref = db.collection('players').doc(pid);
            const snap = await ref.get();
            if (snap.exists) {
                const points = snap.data().points || 1000;
                batch.update(ref, { points: points - pointDelta });
            }
        }

        await batch.commit();

        const currentChallengeRef = db.collection('challenges').doc('current');
        const challengeDoc = await currentChallengeRef.get();
        if (challengeDoc.exists) {
            await currentChallengeRef.delete();
        }

        return message.channel.send(
            `🏆 Match result recorded: **${resultTeam.toUpperCase()}** wins!\n` +
            `Challenge closed.\nMatch ID: \`${matchId}\`\n` +
            `You can review it with \`!results ${matchId}\``
        );
    }
};