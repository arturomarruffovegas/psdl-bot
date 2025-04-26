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
    const isStartPregame = current.type === 'start' && current.status !== 'ready';
    if (isChallengePregame || isStartPregame) {
      return null;
    }
    // otherwise tear down ready match so new pregame can start
    await ref.delete();
  }

  const data = { type, startedAt: new Date().toISOString(), status: 'pending' };

  if (type === 'challenge') {
    if (!challenged) throw new Error('Challenge type requires a challenged user.');
    data.captain1 = initiator;
    data.captain2 = challenged;
    data.pool = [];
    data.picks = { radiant: [], dire: [] };
    data.firstPickTeam = null;
  } else if (type === 'start') {
    data.starter = initiator;
    data.pool = [initiator];
    data.votes = { radiant: [], dire: [] };
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
  // grab everything, then filter in memory
  const snaps = await db.collection('ongoingMatches').get();
  for (const doc of snaps.docs) {
    const data = doc.data();
    let participants = [];

    if (data.type === 'challenge') {
      // challenge games store captains + players arrays
      participants = [
        data.captain1,
        data.captain2,
        ...data.teams.radiant.players,
        ...data.teams.dire.players
      ];
    } else {
      // start games store teams.radiant and teams.dire as simple arrays
      participants = [
        ...data.teams.radiant,
        ...data.teams.dire
      ];
    }

    if (participants.includes(userId)) {
      return { id: doc.id, ...data };
    }
  }

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
    let needCore = Math.max(0, IDEAL_CORES - cores);
    let needSupport = Math.max(0, IDEAL_SUPPORTS - supports);
    let sumTiers = 0;
    for (const p of team) {
      let tier = p.tier;
      if (p.role === 'support' && needCore > 0) { tier = Math.max(1, tier - 1); needCore--; }
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
      bestTierDiff = tierDiff;
    }
  }

  if (!bestPartition) {
    const shuffled = players.slice().sort(() => Math.random() - 0.5);
    return {
      radiant: shuffled.slice(0, 5).map(p => p.id),
      dire: shuffled.slice(5).map(p => p.id)
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

  // 1) cannot sign once a pre‑game is marked ready
  if (data.status === 'ready') {
    return 'match-ready';
  }

  // 2) challenge branch guards
  if (data.type === 'challenge') {
    if (data.status !== 'waiting') {
      // not yet accepted
      return 'not-open';
    }
    const totalPicked = data.picks.radiant.length + data.picks.dire.length;
    if (totalPicked > 0) {
      // drafting already started
      return 'drafting';
    }
  }

  // 3) duplicate guard
  if (data.pool.includes(userId)) {
    return 'already-signed';
  }

  // 4) add to pool
  data.pool.push(userId);

  // 5) start‑match finalization
  if (data.type === 'start') {
    const POOL_SIZE = process.env.START_POOL_SIZE
      ? parseInt(process.env.START_POOL_SIZE, 10)
      : 10;

    // persist the updated pool count
    await ref.update({ pool: data.pool });

    // did we just hit exactly POOL_SIZE?
    if (data.pool.length === POOL_SIZE) {
      // fetch full profiles
      const profiles = await Promise.all(
        data.pool.map(id => playerService.getPlayerProfileById(id))
      );
      const valid = profiles.filter(Boolean);
      if (valid.length !== POOL_SIZE) {
        return 'pool-error';
      }

      // balance teams & make lobby/password
      const teams = balanceStartTeams(valid);
      const lobbyName = generateLobbyName();
      const password = generatePassword();

      // move into ongoingMatches
      const ongoingRec = {
        createdAt: new Date().toISOString(),
        type: 'start',
        teams: { radiant: teams.radiant, dire: teams.dire },
        votes: { radiant: [], dire: [] },
        lobbyName,
        password
      };
      const ongoingRef = await db.collection('ongoingMatches').add(ongoingRec);

      // tear down the pre‑game so new ones can begin
      await ref.delete();

      // signal “ready” (so your !sign command shows the embed)
      return {
        status: 'ready',
        matchId: ongoingRef.id,
        teams,
        finalized: { lobbyName, password }
      };
    }

    // still filling
    return {
      status: data.status,
      count: data.pool.length,
      poolSize: POOL_SIZE
    };
  }

  // 6) challenge branch just persists the pool and returns count
  await ref.update({ pool: data.pool });
  return {
    status: data.status,
    count: data.pool.length
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

  // only enforce >=8 sign‑ups before the very first pick
  const picksCount = data.picks.radiant.length + data.picks.dire.length;
  if (picksCount === 0 && (data.pool?.length ?? 0) < 8) {
    return { error: 'not-enough-players' };
  }

  const { picks, pool, captain1, captain2 } = data;
  if (!pool.includes(userId)) return { error: 'not-in-pool' };

  // on first pick, choose random side if not already set
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
  else picks.dire.push(userId);

  // remove from pool
  const newPool = pool.filter(id => id !== userId);

  // only 8 total picks (captains outside pool)
  const MAX_PICKS = process.env.MAX_PICKS
    ? parseInt(process.env.MAX_PICKS, 10)
    : 8;

  if (picks.radiant.length + picks.dire.length === MAX_PICKS) {
    const teams = { radiant: picks.radiant.slice(), dire: picks.dire.slice() };
    const lobbyName = generateLobbyName();
    const password = generatePassword();

    // archive to ongoingMatches
    const onRec = {
      createdAt: new Date().toISOString(),
      type: 'challenge',
      captain1,
      captain2,
      teams: {
        radiant: { captain: captain1, players: teams.radiant },
        dire: { captain: captain2, players: teams.dire }
      },
      winner: null,
      lobbyName,
      password
    };
    const onRef = await db.collection('ongoingMatches').add(onRec);
    await ref.delete();

    return {
      team: isRadTurn ? 'Radiant' : 'Dire',
      finalized: { lobbyName, password, teams },
      status: 'ongoing',
      matchId: onRef.id
    };
  }

  // still drafting
  await ref.update({ pool: newPool, picks });
  return {
    team: isRadTurn ? 'Radiant' : 'Dire',
    finalized: null
  };
}

/**
 * Admin-only: force-close any match immediately.
 * @param {string} matchId
 * @param {'radiant'|'dire'} winner
 * @returns {{ matchId: string, winner: string }|{ error: string }}
 */
async adminCloseMatch(matchId, winner) {
  const ongoingRef = db.collection('ongoingMatches').doc(matchId);
  const snap = await ongoingRef.get();
  if (!snap.exists) {
    return { error: 'no-match' };
  }

  const data = snap.data();
  // add your result fields
  data.winner = winner;
  data.closedAt = new Date().toISOString();
  data.status = 'closed';

  // 1) Archive into "matches"
  await db.collection('matches').doc(matchId).set(data);

  // 2) Remove from ongoingMatches
  await ongoingRef.delete();

  return { matchId, winner };
}

/**
 * Submit the result of an ongoing game.
 * For challenge: captains only.
 * For start: voting by participants.
 */
async function submitResult(userId, captainId, resultTeam, matchId) {
  const ref = db.collection('ongoingMatches').doc(matchId);

  // 1) Validate the resultTeam parameter
  if (!['radiant', 'dire'].includes(resultTeam)) {
    return { error: 'invalid-team' };
  }

  // 2) Load the existing ongoing match
  const snap = await ref.get();
  if (!snap.exists) {
    return { error: 'no-match' };
  }
  const data = snap.data();

  // --- Challenge flow: only one submission allowed ---
  if (data.type === 'challenge') {
    // Run a transaction that ensures only the first valid submitter can delete the doc
    try {
      await db.runTransaction(async t => {
        const txSnap = await t.get(ref);
        if (!txSnap.exists) {
          throw new Error('no-match');
        }
        const txData = txSnap.data();

        // Only captains may record the result
        if (![txData.captain1, txData.captain2].includes(captainId)) {
          throw new Error('not-captain');
        }

        // Delete the doc so subsequent calls see “no-match”
        t.delete(ref);
      });
    } catch (err) {
      if (err.message === 'no-match') {
        return { error: 'no-match' };
      }
      if (err.message === 'not-captain') {
        return { error: 'not-captain' };
      }
      // Any other error (e.g. doc already deleted) → already submitted
      return { error: 'already-submitted' };
    }

    // At this point the transaction succeeded and the doc is gone.
    // Proceed to archive and award points:

    // Normalize player arrays
    const radArr = Array.isArray(data.teams.radiant.players)
      ? data.teams.radiant.players
      : data.teams.radiant;
    const dirArr = Array.isArray(data.teams.dire.players)
      ? data.teams.dire.players
      : data.teams.dire;

    // Build the finalized record
    const finalRec = {
      createdAt: new Date().toISOString(),
      radiant: { captain: data.captain1, players: radArr },
      dire: { captain: data.captain2, players: dirArr },
      winner: resultTeam,
      lobbyName: data.lobbyName,
      password: data.password
    };
    const finalDocRef = await db.collection('finalizedMatches').add(finalRec);

    // Batch-update points
    const batch = db.batch();
    const delta = 25;
    const winnerTeam = resultTeam === 'radiant'
      ? { captain: data.captain1, players: radArr }
      : { captain: data.captain2, players: dirArr };
    const loserTeam = resultTeam === 'radiant'
      ? { captain: data.captain2, players: dirArr }
      : { captain: data.captain1, players: radArr };

    for (const pid of [...winnerTeam.players, winnerTeam.captain]) {
      const uref = db.collection('players').doc(pid);
      const usnap = await uref.get();
      if (usnap.exists) {
        const pts = usnap.data().points ?? 1000;
        batch.update(uref, { points: pts + delta });
      }
    }
    for (const pid of [...loserTeam.players, loserTeam.captain]) {
      const uref = db.collection('players').doc(pid);
      const usnap = await uref.get();
      if (usnap.exists) {
        const pts = usnap.data().points ?? 1000;
        batch.update(uref, { points: pts - delta });
      }
    }
    await batch.commit();

    return { matchId: finalDocRef.id, winner: resultTeam };
  }

  // --- Start flow: voting by participants ---
  if (data.type === 'start') {
    // init votes if missing
    if (!data.votes) data.votes = { radiant: [], dire: [] };

    // prevent double‑voting
    if (data.votes.radiant.includes(userId) || data.votes.dire.includes(userId)) {
      return { error: 'already-voted' };
    }

    // only participants may vote
    const participants = [
      ...(Array.isArray(data.teams.radiant.players) ? data.teams.radiant.players : data.teams.radiant),
      ...(Array.isArray(data.teams.dire.players) ? data.teams.dire.players : data.teams.dire)
    ];
    if (!participants.includes(userId)) {
      return { error: 'not-participant' };
    }

    // record the vote
    data.votes[resultTeam].push(userId);
    await ref.update({ votes: data.votes });

    // finalize once a team hits 6 votes
    if (data.votes[resultTeam].length >= 6) {
      const finalRec = {
        createdAt: new Date().toISOString(),
        radiant: { players: participants.slice(0, participants.length / 2) },
        dire: { players: participants.slice(participants.length / 2) },
        winner: resultTeam,
        lobbyName: data.lobbyName,
        password: data.password
      };
      const finalDocRef = await db.collection('finalizedMatches').add(finalRec);

      // adjust points just like above…
      const batch = db.batch();
      const delta = 25;
      const winners = resultTeam === 'radiant'
        ? participants.slice(0, participants.length / 2)
        : participants.slice(participants.length / 2);
      const losers = resultTeam === 'radiant'
        ? participants.slice(participants.length / 2)
        : participants.slice(0, participants.length / 2);

      for (const pid of winners) {
        const uref = db.collection('players').doc(pid);
        const usnap = await uref.get();
        if (usnap.exists) {
          const pts = usnap.data().points ?? 1000;
          batch.update(uref, { points: pts + delta });
        }
      }
      for (const pid of losers) {
        const uref = db.collection('players').doc(pid);
        const usnap = await uref.get();
        if (usnap.exists) {
          const pts = usnap.data().points ?? 1000;
          batch.update(uref, { points: pts - delta });
        }
      }
      await batch.commit();

      // remove from ongoingMatches
      await ref.delete();

      return {
        status: 'finalized',
        matchId: finalDocRef.id,
        winner: resultTeam
      };
    }

    // still voting
    return {
      status: 'pending',
      votes: data.votes
    };
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
  removeFromPool,
  adminCloseMatch
};
