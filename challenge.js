// challenge.js
const db = require('./firebase');

function generateLobbyName() {
    const randomNum = Math.floor(100000 + Math.random() * 900000); // 6-digit number
    return `PSDL-${randomNum}`;
}

function generatePassword() {
    return Math.random().toString(36).substring(2, 8);
}

async function createChallenge(challenger, challenged) {
    console.log('[createChallenge] Called with:');
    console.log('  challenger:', challenger);
    console.log('  challenged:', challenged);

    if (!challenger || !challenged) {
        throw new Error('Both challenger and challenged must be provided');
    }

    const ref = db.collection('challenges').doc('current');
    const doc = await ref.get();

    if (doc.exists) {
        console.log('[createChallenge] A challenge is already in progress.');
        return null;
    }

    const data = {
        startedAt: new Date().toISOString(),
        captain1: challenger,
        captain2: challenged,
        pool: [],
        picks: { radiant: [], dire: [] },
        status: 'pending'
    };

    console.log('[createChallenge] Saving challenge to Firestore:', data);
    await ref.set(data);
    return data;
}

async function signToPool(userId) {
    const ref = db.collection('challenges').doc('current');
    const doc = await ref.get();
    if (!doc.exists) return 'no-challenge';
    const data = doc.data();

    if (data.pool.includes(userId)) return 'already-signed';

    // ✅ Check if the user is already in an ongoing match (no result yet)
    const matches = await db.collection('matches')
        .where('winner', '==', null)
        .get();

    for (const match of matches.docs) {
        const m = match.data();
        const allPlayers = [...(m.radiant?.players || []), ...(m.dire?.players || [])];
        if (allPlayers.includes(userId)) return 'already-in-game';
    }

    data.pool.push(userId);
    await ref.update({ pool: data.pool });
    return 'signed';
}

async function getCurrentPool() {
    const doc = await db.collection('challenges').doc('current').get();
    if (!doc.exists) return [];
    return doc.data().pool;
}

async function abortChallenge() {
    const ref = db.collection('challenges').doc('current');
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
}

async function pickPlayer(captainId, userId) {
    const ref = db.collection('challenges').doc('current');
    const doc = await ref.get();
    if (!doc.exists) return { error: 'no-challenge' };

    const data = doc.data();
    const { picks, pool, captain1, captain2 } = data;

    if (!pool.includes(userId)) return { error: 'not-in-pool' };
    if (![captain1, captain2].includes(captainId)) return { error: 'not-captain' };

    const radiant = picks.radiant;
    const dire = picks.dire;

    const isRadiantTurn = radiant.length === dire.length;
    const isCaptainTurn =
        (isRadiantTurn && captainId === captain1) ||
        (!isRadiantTurn && captainId === captain2);

    if (!isCaptainTurn) return { error: 'not-your-turn' };

    // Assign to team
    if (isRadiantTurn) radiant.push(userId);
    else dire.push(userId);

    // Remove from pool
    const newPool = pool.filter(id => id !== userId);

    // If full teams, finalize match
    let finalized = null;
    if (radiant.length === 5 && dire.length === 5) {
        finalized = {
            lobbyName: generateLobbyName(),
            password: generatePassword(),
            status: 'ready'
        };

        await db.collection('matches').add({
            createdAt: new Date().toISOString(),
            radiant: { captain: captain1, players: radiant },
            dire: { captain: captain2, players: dire },
            winner: null,
            lobbyName: finalized.lobbyName,
            password: finalized.password
        });
    }

    await ref.update({
        pool: newPool,
        picks,
        ...(finalized || {})
    });

    return {
        team: isRadiantTurn ? 'Radiant' : 'Dire',
        finalized
    };
}

async function submitResult(captainId, resultTeam) {
    const ref = db.collection('challenges').doc('current');
    const doc = await ref.get();
    if (!doc.exists) return { error: 'no-challenge' };

    const data = doc.data();
    const { captain1, captain2 } = data;

    if (![captain1, captain2].includes(captainId)) return { error: 'not-captain' };
    if (!['radiant', 'dire'].includes(resultTeam)) return { error: 'invalid-team' };

    // Add result to matches
    const matchRef = db.collection('matches')
        .where('radiant.captain', '==', captain1)
        .where('dire.captain', '==', captain2)
        .orderBy('createdAt', 'desc')
        .limit(1);

    const matchSnap = await matchRef.get();
    if (matchSnap.empty) return { error: 'match-not-found' };

    const matchDoc = matchSnap.docs[0];
    await matchDoc.ref.update({ winner: resultTeam });

    // Clear current challenge
    await ref.delete();

    return { winner: resultTeam };
}

module.exports = {
    createChallenge,
    signToPool,
    getCurrentPool,
    abortChallenge,
    pickPlayer,
    submitResult,
    generateLobbyName,
    generatePassword
};