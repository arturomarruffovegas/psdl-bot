// services/matchService.js

const db = require('./db');
const playerService = require('./playerService');

// Helper functions for generating lobby name and password.
function generateLobbyName() {
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `PSDL-${randomNum}`;
}

function generatePassword() {
  return Math.random().toString(36).substring(2, 8);
}

/**
 * Create a new match.
 * For "challenge": sets up captains, empty pool and picks, and firstPickTeam = null.
 * For "start": sets up starter, auto-signs them, and initializes votes.
 */
async function createMatch(type, initiator, challenged = null) {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();

  if (doc.exists) {
    const current = doc.data();
    // block if still in pregame
    const isChallengePregame = current.type === 'challenge' && current.status !== 'ready';
    const isStartPregame     = current.type === 'start'     && current.status !== 'ready';
    if (isChallengePregame || isStartPregame) {
      return null;
    }
    // otherwise tear down ready match so new pregame can start
    await ref.delete();
  }

  const data = { type, startedAt: new Date().toISOString(), status: 'pending' };

  if (type === 'challenge') {
    if (!challenged) throw new Error('Challenge type requires a challenged user.');
    data.captain1      = initiator;
    data.captain2      = challenged;
    data.pool          = [];
    data.picks         = { radiant: [], dire: [] };
    data.firstPickTeam = null;
  } else if (type === 'start') {
    data.starter = initiator;
    data.pool    = [initiator];
    data.votes   = { radiant: [], dire: [] };
  } else {
    throw new Error('Invalid match type.');
  }

  await ref.set(data);
  return data;
}

/** Get the current pregame (if any) */
async function getCurrentMatch() {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return null;
  return doc.data();
}

/** Find an ongoing (in‑play) match for a given user */
async function getOngoingMatchForUser(userId) {
  let qs = await db.collection('ongoingMatches')
    .where('teams.radiant.players', 'array-contains', userId)
    .get();
  if (!qs.empty) return { id: qs.docs[0].id, ...qs.docs[0].data() };

  qs = await db.collection('ongoingMatches')
    .where('teams.dire.players', 'array-contains', userId)
    .get();
  if (!qs.empty) return { id: qs.docs[0].id, ...qs.docs[0].data() };

  return null;
}

// Helper: combinations
function getCombinations(arr, k) {
  const results = [];
  function combine(start, combo) {
    if (combo.length === k) {
      results.push(combo.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  }
  combine(0, []);
  return results;
}

/** Balance teams for start‑matches (10 players) */
function balanceStartTeams(players) {
  const CORE_WEIGHT = 2;
  const IDEAL_CORES = 3;
  const IDEAL_SUPPORTS = 2;

  let bestPartition = null, bestCompError = Infinity, bestTierDiff = Infinity;
  const combos = getCombinations(players, IDEAL_CORES + IDEAL_SUPPORTS);

  function evaluateTeam(team) {
    let cores = 0, supports = 0;
    for (const p of team) {
      p.role.toLowerCase() === 'core' ? cores++ : supports++;
    }
    let needCore    = Math.max(0, IDEAL_CORES - cores);
    let needSupport = Math.max(0, IDEAL_SUPPORTS - supports);
    let sumTiers = 0;
    for (const p of team) {
      let tier = p.tier;
      if (p.role === 'support' && needCore > 0)    { tier = Math.max(1, tier - 1); needCore--; }
      else if (p.role === 'core' && needSupport > 0) { tier = Math.max(1, tier - 1); needSupport--; }
      sumTiers += p.role === 'core' ? tier * CORE_WEIGHT : tier;
    }
    return { cores, supports, sumTiers };
  }

  for (const t1 of combos) {
    const ids1 = new Set(t1.map(p => p.id));
    const t2 = players.filter(p => !ids1.has(p.id));
    if (t2.length !== IDEAL_CORES + IDEAL_SUPPORTS) continue;
    const e1 = evaluateTeam(t1), e2 = evaluateTeam(t2);
    const compError = Math.abs(e1.cores - IDEAL_CORES)
                    + Math.abs(e1.supports - IDEAL_SUPPORTS)
                    + Math.abs(e2.cores - IDEAL_CORES)
                    + Math.abs(e2.supports - IDEAL_SUPPORTS);
    const tierDiff = Math.abs(e1.sumTiers - e2.sumTiers);
    if (compError < bestCompError || (compError === bestCompError && tierDiff < bestTierDiff)) {
      bestPartition = { team1: t1.map(p => p.id), team2: t2.map(p => p.id) };
      bestCompError = compError;
      bestTierDiff  = tierDiff;
    }
  }

  if (!bestPartition) {
    const shuffled = players.slice().sort(() => Math.random() - 0.5);
    return {
      radiant: shuffled.slice(0,5).map(p => p.id),
      dire:    shuffled.slice(5).map(p => p.id)
    };
  }

  if (Math.random() < 0.5) {
    return { radiant: bestPartition.team1, dire: bestPartition.team2 };
  } else {
    return { radiant: bestPartition.team2, dire: bestPartition.team1 };
  }
}

/**
 * Sign a user into the current match’s pool.
 * - For start: when pool fills, creates an ongoing match.
 * - For challenge: only updates the pool.
 */
async function signToPool(userId) {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return 'no-match';

  const data = doc.data();

  // can't sign if game already ready
  if (data.status === 'ready') return 'match-ready';

  // challenge must be accepted and not yet drafting
  if (data.type === 'challenge') {
    if (data.status !== 'waiting') return 'not-open';
    if (data.picks.radiant.length + data.picks.dire.length > 0) return 'drafting';
  }

  if (data.pool.includes(userId)) return 'already-signed';
  data.pool.push(userId);

  if (data.type === 'start') {
    const POOL_SIZE = process.env.START_POOL_SIZE
      ? parseInt(process.env.START_POOL_SIZE,10)
      : 10;
    await ref.update({ pool: data.pool });
    if (data.pool.length === POOL_SIZE) {
      const profiles = await Promise.all(
        data.pool.map(id => playerService.getPlayerProfileById(id))
      );
      const valid = profiles.filter(Boolean);
      if (valid.length !== POOL_SIZE) return 'pool-error';

      // balance, archive to ongoingMatches
      const teams = balanceStartTeams(valid);
      const lobbyName = generateLobbyName();
      const password  = generatePassword();
      const onRec = {
        createdAt: new Date().toISOString(),
        type: 'start',
        teams: { radiant: teams.radiant, dire: teams.dire },
        votes: { radiant: [], dire: [] },
        lobbyName,
        password
      };
      const onRef = await db.collection('ongoingMatches').add(onRec);
      await ref.delete();

      return {
        status:    'ongoing',
        matchId:   onRef.id,
        teams,
        finalized: { lobbyName, password }
      };
    }

    return {
      status:   data.status,
      count:    data.pool.length,
      poolSize: POOL_SIZE
    };
  }

  // challenge branch
  await ref.update({ pool: data.pool });
  return {
    status: data.status,
    count:  data.pool.length
  };
}

/** Abort the current pregame */
async function abortMatch() {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.delete();
  return true;
}

/**
 * Allow a captain to pick from the pool, once at least 8 have signed.
 * Randomizes firstPickTeam on the very first pick.
 */
async function pickPlayer(captainId, userId) {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return { error: 'no-match' };

  const data = doc.data();
  if (data.type !== 'challenge') return { error: 'not-applicable' };

  // must have >=8 signed before drafting
  if ((data.pool?.length ?? 0) < 8) {
    return { error: 'not-enough-players' };
  }

  const { picks, pool, captain1, captain2 } = data;
  if (!pool.includes(userId)) return { error: 'not-in-pool' };

  // on first pick, choose random side
  if (data.firstPickTeam === null && picks.radiant.length === 0 && picks.dire.length === 0) {
    const side = Math.random() < 0.5 ? 'radiant' : 'dire';
    await ref.update({ firstPickTeam: side });
    data.firstPickTeam = side;
  }

  // determine whose turn
  let isRadTurn;
  if (picks.radiant.length === picks.dire.length) {
    isRadTurn = data.firstPickTeam === 'radiant';
  } else {
    isRadTurn = picks.radiant.length < picks.dire.length;
  }

  const expected = isRadTurn ? captain1 : captain2;
  if (captainId !== expected) return { error: 'not-your-turn' };

  // apply pick
  if (isRadTurn) picks.radiant.push(userId);
  else           picks.dire.push(userId);

  // remove from pool
  const newPool = pool.filter(id => id !== userId);

  // only 8 total picks (captains outside pool)
  const MAX_PICKS = process.env.MAX_PICKS
    ? parseInt(process.env.MAX_PICKS,10)
    : 8;

  if (picks.radiant.length + picks.dire.length === MAX_PICKS) {
    const teams     = { radiant: picks.radiant.slice(), dire: picks.dire.slice() };
    const lobbyName = generateLobbyName();
    const password  = generatePassword();

    // archive to ongoingMatches
    const onRec = {
      createdAt: new Date().toISOString(),
      type: 'challenge',
      captain1,
      captain2,
      teams: {
        radiant: { captain: captain1, players: teams.radiant },
        dire:    { captain: captain2, players: teams.dire }
      },
      winner:   null,
      lobbyName,
      password
    };
    const onRef = await db.collection('ongoingMatches').add(onRec);
    await ref.delete();

    return {
      team:      isRadTurn ? 'Radiant' : 'Dire',
      finalized: { lobbyName, password, teams },
      status:    'ongoing',
      matchId:   onRef.id
    };
  }

  // still drafting
  await ref.update({ pool: newPool, picks });
  return {
    team:      isRadTurn ? 'Radiant' : 'Dire',
    finalized: null
  };
}

/**
 * Submit the result of an ongoing game.
 * For challenge: captains only.
 * For start: voting by participants.
 */
async function submitResult(userId, captainId, resultTeam, matchId) {
  const ref  = db.collection('ongoingMatches').doc(matchId);
  const snap = await ref.get();
  if (!snap.exists) return { error: 'no-match' };
  const data = snap.data();

  if (!['radiant','dire'].includes(resultTeam)) {
    return { error: 'invalid-team' };
  }

  // challenge flow
  if (data.type === 'challenge') {
    if (![data.captain1, data.captain2].includes(captainId)) {
      return { error: 'not-captain' };
    }
    const finalRec = {
      createdAt: new Date().toISOString(),
      radiant:   { captain: data.captain1, players: data.teams.radiant.players },
      dire:      { captain: data.captain2, players: data.teams.dire.players },
      winner:    resultTeam,
      lobbyName: data.lobbyName,
      password:  data.password
    };
    const finalDocRef = await db.collection('finalizedMatches').add(finalRec);

    // adjust points
    const batch = db.batch(), delta = 25;
    const win = resultTeam === 'radiant' ? data.teams.radiant : data.teams.dire;
    const lose= resultTeam === 'radiant' ? data.teams.dire    : data.teams.radiant;
    for (const pid of [...win.players, win.captain]) {
      const uref = db.collection('players').doc(pid), usnap = await uref.get();
      if (usnap.exists) batch.update(uref, { points: (usnap.data().points||1000) + delta });
    }
    for (const pid of [...lose.players, lose.captain]) {
      const uref = db.collection('players').doc(pid), usnap = await uref.get();
      if (usnap.exists) batch.update(uref, { points: (usnap.data().points||1000) - delta });
    }
    await batch.commit();

    await ref.delete();
    return { matchId: finalDocRef.id, winner: resultTeam };
  }

  // start flow
  if (data.type === 'start') {
    if (!data.votes) data.votes = { radiant: [], dire: [] };
    if (data.votes.radiant.includes(userId) || data.votes.dire.includes(userId)) {
      return { error: 'already-voted' };
    }
    const participants = [...data.teams.radiant.players, ...data.teams.dire.players];
    if (!participants.includes(userId)) {
      return { error: 'not-participant' };
    }
    data.votes[resultTeam].push(userId);
    await ref.update({ votes: data.votes });

    if (data.votes[resultTeam].length >= 6) {
      const finalRec = {
        createdAt: new Date().toISOString(),
        radiant:   { players: data.teams.radiant.players },
        dire:      { players: data.teams.dire.players },
        winner:    resultTeam,
        lobbyName: data.lobbyName,
        password:  data.password
      };
      const finalDocRef = await db.collection('finalizedMatches').add(finalRec);

      const batch = db.batch(), delta = 25;
      const winIds  = data.teams[resultTeam].players;
      const loseIds = data.teams[resultTeam === 'radiant' ? 'dire' : 'radiant'].players;
      for (const pid of winIds) {
        const uref = db.collection('players').doc(pid), usnap = await uref.get();
        if (usnap.exists) batch.update(uref, { points: (usnap.data().points||1000) + delta });
      }
      for (const pid of loseIds) {
        const uref = db.collection('players').doc(pid), usnap = await uref.get();
        if (usnap.exists) batch.update(uref, { points: (usnap.data().points||1000) - delta });
      }
      await batch.commit();

      await ref.delete();
      return { status: 'finalized', matchId: finalDocRef.id, winner: resultTeam };
    }

    return { status: 'pending', votes: data.votes };
  }

  return { error: 'unknown-match-type' };
}

/** Remove a user from the pregame pool */
async function removeFromPool(userId) {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return 'no-match';
  const data = doc.data();

  if (data.type === 'challenge' &&
      (data.picks.radiant.length + data.picks.dire.length) > 0) {
    return 'picking-started';
  }
  if (data.type === 'start' && data.status === 'ready') {
    return 'match-ready';
  }
  if (!data.pool.includes(userId)) return 'not-signed';

  const newPool = data.pool.filter(id => id !== userId);
  await ref.update({ pool: newPool });
  return 'unsigned';
}

module.exports = {
  createMatch,
  getCurrentMatch,
  getOngoingMatchForUser,
  signToPool,
  abortMatch,
  pickPlayer,
  submitResult,
  removeFromPool
};
