const db = require('./db');

function generateLobbyName() {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    return `PSDL-${randomNum}`;
}

function generatePassword() {
    return Math.random().toString(36).substring(2, 8);
}

async function createChallenge(challenger, challenged) {
    const ref = db.collection('challenges').doc('current');
    const doc = await ref.get();
    if (doc.exists) return null;

    // Assign the challenger and challenged explicitly.
    const captain1 = challenger;
    const captain2 = challenged;

    const data = {
        startedAt: new Date().toISOString(),
        captain1,
        captain2,
        pool: [],
        picks: { radiant: [], dire: [] },
        status: 'pending'
    };

    await ref.set(data);
    return data;
}

async function signToPool(userId) {
    const ref = db.collection('challenges').doc('current');
    const doc = await ref.get();
    if (!doc.exists) return 'no-challenge';
    const data = doc.data();

    if (data.pool.includes(userId)) return 'already-signed';

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

    // validation
    if (!pool.includes(userId)) return { error: 'not-in-pool' };
    if (![captain1, captain2].includes(captainId)) return { error: 'not-captain' };

    const radiant = picks.radiant;
    const dire = picks.dire;
    const isRadiantTurn = radiant.length === dire.length;
    const isCaptainTurn =
        (isRadiantTurn && captainId === captain1) ||
        (!isRadiantTurn && captainId === captain2);
    if (!isCaptainTurn) return { error: 'not-your-turn' };

    // Assign pick
    if (isRadiantTurn) radiant.push(userId);
    else dire.push(userId);

    // Remove from pool
    const newPool = pool.filter(id => id !== userId);

    // ── NEW: stop at 8 total picks for a 5v5 ──
    const TOTAL_PLAYERS = process.env.MAX_PLAYERS
        ? parseInt(process.env.MAX_PLAYERS, 10)
        : 10;
    const PICKS_NEEDED = TOTAL_PLAYERS - 2;  // subtract 2 captains

    let finalized = null;
    if (radiant.length + dire.length === PICKS_NEEDED) {
        // time to finalize a 5v5
        const lobbyName = generateLobbyName();
        const password = generatePassword();
        finalized = { lobbyName, password, status: 'ready' };

        // persist into your permanent matches collection
        await db.collection('matches').add({
            createdAt: new Date().toISOString(),
            radiant: { captain: captain1, players: radiant },
            dire: { captain: captain2, players: dire },
            winner: null,
            lobbyName,
            password
        });
    }

    // write back the in‑flight challenge
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

async function submitResult(matchId, captainId, resultTeam) {
    if (!['radiant', 'dire'].includes(resultTeam)) {
        return { error: 'invalid-team' };
    }

    const matchDocRef = db.collection('matches').doc(matchId);
    const matchSnap = await matchDocRef.get();
    if (!matchSnap.exists) return { error: 'match-not-found' };

    const matchData = matchSnap.data();
    const { radiant, dire } = matchData;

    if (![radiant.captain, dire.captain].includes(captainId)) {
        return { error: 'not-captain' };
    }

    await matchDocRef.update({ winner: resultTeam });

    const winnerTeam = resultTeam === 'radiant' ? radiant : dire;
    const loserTeam = resultTeam === 'radiant' ? dire : radiant;
    const pointChange = 25;

    const adjustPoints = async (userId, delta) => {
        const userRef = db.collection('players').doc(userId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) return;
        const current = userSnap.data().points ?? 1000;
        await userRef.update({ points: current + delta });
    };

    for (const id of winnerTeam.players.concat(winnerTeam.captain)) {
        await adjustPoints(id, pointChange);
    }

    for (const id of loserTeam.players.concat(loserTeam.captain)) {
        await adjustPoints(id, -pointChange);
    }

    await db.collection('challenges').doc('current').delete();

    return { matchId, winner: resultTeam };
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