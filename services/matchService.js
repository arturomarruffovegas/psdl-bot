const db = require('./db');
const playerService = require('./playerService'); // for fetching player details when needed

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
 *
 * For a challenge match:
 *  - type: "challenge"
 *  - challenger becomes captain1, challenged becomes captain2.
 *  - pool is initially empty; picks object is set.
 *
 * For a start match:
 *  - type: "start"
 *  - starter is set to initiator.
 *  - pool initially contains the starter.
 *  - votes object is set for result reporting.
 *  - The pool is capped at 10 players.
 */
async function createMatch(type, initiator, challenged = null) {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();
  if (doc.exists) return null; // A match is already active.

  let data = { type, startedAt: new Date().toISOString(), status: 'pending' };

  if (type === 'challenge') {
    if (!challenged) throw new Error('Challenge type requires a challenged user.');
    data.captain1 = initiator;
    data.captain2 = challenged;
    data.pool = [];
    data.picks = { radiant: [], dire: [] };
  } else if (type === 'start') {
    data.starter = initiator;
    data.pool = [initiator]; // Auto-sign the initiator.
    data.votes = { radiant: [], dire: [] };
    // Teams will be set automatically when pool.length reaches 10.
  } else {
    throw new Error('Invalid match type.');
  }

  await ref.set(data);
  return data;
}

/**
 * Get the currently active match (if any).
 */
async function getCurrentMatch() {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return null;
  return doc.data();
}

/**
 * Generate all combinations of k elements from array arr.
 */
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

/**
 * Given an array of 10 player objects (each with properties: id, role, tier),
 * partition them into two teams of 5 such that:
 *  - Ideally, each team has 3 cores and 2 supports.
 *  - The sums of their tiers are as balanced as possible.
 *
 * Returns an object { radiant: [...], dire: [...] } with arrays of player IDs.
 */
/**
 * Given an array of 10 player objects (each with properties: id, role, tier),
 * partition them into two teams of 5 such that:
 *  - Ideally, each team has 3 cores and 2 supports.
 *  - The weighted sums of their tiers are as balanced as possible
 *    (cores count as 1.3× their tier, supports as 1× their tier).
 *
 * Returns an object { radiant: [...], dire: [...] } with arrays of player IDs.
 */
function balanceStartTeams(players) {
  const CORE_WEIGHT = 1.3;
  const combinations = getCombinations(players, 5);
  let bestPartition = null;
  let bestCompError = Infinity;
  let bestTierDiff = Infinity;

  // Helper: count roles and compute weighted sum tiers for a given team.
  function evaluateTeam(team) {
    let cores = 0;
    let supports = 0;
    let sumTiers = 0;
    for (const p of team) {
      if (p.role.toLowerCase() === 'core') {
        cores++;
        sumTiers += p.tier * CORE_WEIGHT;
      } else if (p.role.toLowerCase() === 'support') {
        supports++;
        sumTiers += p.tier;
      }
    }
    return { cores, supports, sumTiers };
  }

  for (const team1 of combinations) {
    const team1Ids = new Set(team1.map(p => p.id));
    const team2 = players.filter(p => !team1Ids.has(p.id));
    if (team2.length !== 5) continue;

    const eval1 = evaluateTeam(team1);
    const eval2 = evaluateTeam(team2);

    // Composition error vs ideal 3 cores & 2 supports
    const compError = Math.abs(eval1.cores - 3)
      + Math.abs(eval1.supports - 2)
      + Math.abs(eval2.cores - 3)
      + Math.abs(eval2.supports - 2);

    // Tier difference on weighted sums
    const tierDiff = Math.abs(eval1.sumTiers - eval2.sumTiers);

    if (
      compError < bestCompError ||
      (compError === bestCompError && tierDiff < bestTierDiff)
    ) {
      bestPartition = {
        team1: team1.map(p => p.id),
        team2: team2.map(p => p.id)
      };
      bestCompError = compError;
      bestTierDiff = tierDiff;
    }
  }

  if (!bestPartition) {
    // fallback random split
    const shuffled = players.slice().sort(() => Math.random() - 0.5);
    return {
      radiant: shuffled.slice(0, 5).map(p => p.id),
      dire: shuffled.slice(5, 10).map(p => p.id)
    };
  }

  // randomly assign which partition is Radiant
  if (Math.random() < 0.5) {
    return {
      radiant: bestPartition.team1,
      dire: bestPartition.team2
    };
  } else {
    return {
      radiant: bestPartition.team2,
      dire: bestPartition.team1
    };
  }
}

/**
 * Sign a user into the current match's pool.
 *
 * For a challenge match: There is no cap.
 * For a start match: The pool is capped at 10 players.
 *  When exactly 10 players have signed, teams are balanced using sophisticated logic,
 *  and the match status is set to "ready".
 */
async function signToPool(userId) {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return 'no-match';
  const data = doc.data();

  // Ensure the user is not already in the pool.
  if (data.pool.includes(userId)) return 'already-signed';

  // Add the user
  data.pool.push(userId);

  if (data.type === 'start') {
    // Read pool size from ENV (default to 10)
    const POOL_SIZE = process.env.START_POOL_SIZE
      ? parseInt(process.env.START_POOL_SIZE, 10)
      : 10;

    // 🔍 DEBUG LOG
    console.log('⚙️  START_POOL_SIZE env var:', process.env.START_POOL_SIZE,
      '→ POOL_SIZE used in code:', POOL_SIZE);

    if (data.pool.length > POOL_SIZE) return 'pool-full';

    // Persist the updated pool
    await ref.update({ pool: data.pool });

    // Finalize when we hit exactly POOL_SIZE
    if (data.pool.length === POOL_SIZE) {
      // Fetch detailed profiles for all players
      const players = await Promise.all(
        data.pool.map(id => playerService.getPlayerProfileById(id))
      );
      const validPlayers = players.filter(p => p);
      if (validPlayers.length !== POOL_SIZE) return 'pool-error';

      // Balance teams
      const teams = balanceStartTeams(validPlayers);

      // Generate lobby details
      const lobbyName = generateLobbyName();
      const password = generatePassword();

      // Update match status
      await ref.update({
        teams: teams,
        status: 'ready',
        lobbyName,
        password
      });

      return {
        status: 'ready',
        teams,
        finalized: { lobbyName, password }
      };
    }

    // If not yet full, return the current count
    return {
      status: data.status,
      count: data.pool.length,
      poolSize: POOL_SIZE
    };
  }

  // Challenge match branch
  await ref.update({ pool: data.pool });
  return {
    status: data.status,
    count: data.pool.length
  };
}

/**
 * Abort the current active match (of either type).
 */
async function abortMatch() {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.delete();
  return true;
}

/**
 * For challenge matches only: allow a captain to pick a player from the pool.
 */
async function pickPlayer(captainId, userId) {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return { error: 'no-match' };

  const data = doc.data();
  if (data.type !== 'challenge') return { error: 'not-applicable' };

  const { picks, pool, captain1, captain2 } = data;
  // 1) must be in pool
  if (!pool.includes(userId)) return { error: 'not-in-pool' };
  // 2) must be a captain
  if (![captain1, captain2].includes(captainId)) return { error: 'not-captain' };

  // determine whose turn
  const radiant = picks.radiant;
  const dire = picks.dire;
  const isRadiantTurn = radiant.length === dire.length;
  const expectedCaptain = isRadiantTurn ? captain1 : captain2;
  if (captainId !== expectedCaptain) return { error: 'not-your-turn' };

  // perform the pick
  if (isRadiantTurn) radiant.push(userId);
  else dire.push(userId);

  // remove from pool
  const newPool = pool.filter(id => id !== userId);

  // how many picks in total to finalize?
  const MAX_PICKS = process.env.MAX_PICKS
    ? parseInt(process.env.MAX_PICKS, 10)
    : 10;

  // if we’re done drafting (5 vs 5)
  if (radiant.length + dire.length === MAX_PICKS) {
    // capture the final teams
    const teams = { radiant: [...radiant], dire: [...dire] };

    // generate lobby/password
    const lobbyName = generateLobbyName();
    const password = generatePassword();

    // archive into finalizedMatches
    await db.collection('finalizedMatches').add({
      createdAt: new Date().toISOString(),
      radiant: { captain: captain1, players: teams.radiant },
      dire: { captain: captain2, players: teams.dire },
      winner: null,
      lobbyName,
      password
    });

    // tear down the current so new matches can start
    await ref.delete();

    // return everything your command needs
    return {
      team: isRadiantTurn ? 'Radiant' : 'Dire',
      teams,     // <-- full 5‑player lists
      finalized: { lobbyName, password }
    };
  }

  // still drafting: persist picks + pool
  await ref.update({
    pool: newPool,
    picks
  });

  return {
    team: isRadiantTurn ? 'Radiant' : 'Dire',
    teams: null,
    finalized: null
  };
}

/**
 * Submit match result.
 * 
 * For challenge matches:
 *   - Captains (captain1/captain2) call !result <radiant|dire>;
 *     the function updates the match, adjusts points, and then deletes the active match.
 * 
 * For start matches:
 *   - Each time a player calls !result, their vote is recorded in a votes object.
 *   - Once one side accumulates 6 votes, the result is finalized (a match record is saved
 *     and the active match is deleted).
 *
 * Parameters:
 *   userId: the caller’s id (lowercase username as stored)
 *   captainId: for challenge matches, the caller’s id (must match a captain)
 *   resultTeam: "radiant" or "dire"
 */
// services/matchService.js

async function submitResult(userId, captainId, resultTeam) {
  const ref = db.collection('matches').doc('current');
  const snap = await ref.get();
  if (!snap.exists) return { error: 'no-match' };
  const data = snap.data();

  if (!['radiant', 'dire'].includes(resultTeam)) {
    return { error: 'invalid-team' };
  }

  // --- Challenge flow ---
  if (data.type === 'challenge') {
    if (![data.captain1, data.captain2].includes(captainId)) {
      return { error: 'not-captain' };
    }

    // Rebuild teams from picks
    const radiantTeam = { captain: data.captain1, players: data.picks.radiant };
    const direTeam = { captain: data.captain2, players: data.picks.dire };
    const winnerTeam = resultTeam === 'radiant' ? radiantTeam : direTeam;
    const loserTeam = resultTeam === 'radiant' ? direTeam : radiantTeam;

    // Mark the winner on the match
    await ref.update({ winner: resultTeam });

    // Adjust points
    const batch = db.batch();
    const delta = 25;

    // Winners +25
    for (const pid of [...winnerTeam.players, winnerTeam.captain]) {
      const uref = db.collection('players').doc(pid);
      const usnap = await uref.get();
      if (usnap.exists) {
        const pts = usnap.data().points ?? 1000;
        batch.update(uref, { points: pts + delta });
      }
    }

    // Losers -25
    for (const pid of [...loserTeam.players, loserTeam.captain]) {
      const uref = db.collection('players').doc(pid);
      const usnap = await uref.get();
      if (usnap.exists) {
        const pts = usnap.data().points ?? 1000;
        batch.update(uref, { points: pts - delta });
      }
    }

    await batch.commit();
    await ref.delete();
    return { matchId: snap.id, winner: resultTeam };
  }

  // --- Start flow ---
  if (data.type === 'start') {
    // initialize votes if needed
    if (!data.votes) data.votes = { radiant: [], dire: [] };

    // prevent double-voting
    if (data.votes.radiant.includes(userId) || data.votes.dire.includes(userId)) {
      return { error: 'already-voted' };
    }

    // only participants may vote
    const participants = [...data.teams.radiant, ...data.teams.dire];
    if (!participants.includes(userId)) {
      return { error: 'not-participant' };
    }

    // record vote
    data.votes[resultTeam].push(userId);
    await ref.update({ votes: data.votes });

    // finalize once threshold reached
    if (data.votes[resultTeam].length >= 6) {
      await ref.update({ winner: resultTeam });

      // build final record
      const finalRec = {
        createdAt: new Date().toISOString(),
        radiant: { players: data.teams.radiant },
        dire: { players: data.teams.dire },
        winner: resultTeam,
        lobbyName: data.lobbyName,
        password: data.password
      };

      // write to permanent store and capture the new doc ID
      const finalDocRef = await db.collection('finalizedMatches').add(finalRec);

      // Adjust points for start-match participants
      const batch = db.batch();
      const delta = 25;
      const winnerIds = data.teams[resultTeam];
      const loserIds = data.teams[resultTeam === 'radiant' ? 'dire' : 'radiant'];

      // Winners +25
      for (const pid of winnerIds) {
        const uref = db.collection('players').doc(pid);
        const usnap = await uref.get();
        if (usnap.exists) {
          const pts = usnap.data().points ?? 1000;
          batch.update(uref, { points: pts + delta });
        }
      }

      // Losers -25
      for (const pid of loserIds) {
        const uref = db.collection('players').doc(pid);
        const usnap = await uref.get();
        if (usnap.exists) {
          const pts = usnap.data().points ?? 1000;
          batch.update(uref, { points: pts - delta });
        }
      }

      await batch.commit();
      await ref.delete();

      // include matchId in the return payload
      return {
        status: 'finalized',
        winner: resultTeam,
        match: finalRec,
        matchId: finalDocRef.id
      };
    }

    return { status: 'pending', votes: data.votes };
  }

  return { error: 'unknown-match-type' };
}

/**
 * Remove a user from the current match's pool.
 */
async function removeFromPool(userId) {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return 'no-match';
  const data = doc.data();

  // In a challenge, once picking has started you can no longer leave
  if (data.type === 'challenge' &&
    (data.picks.radiant.length + data.picks.dire.length) > 0) {
    return 'picking-started';
  }
  // In a start match, once it's ready you can no longer leave
  if (data.type === 'start' && data.status === 'ready') {
    return 'match-ready';
  }

  if (!data.pool.includes(userId)) {
    return 'not-signed';
  }

  // Remove them and persist
  const newPool = data.pool.filter(id => id !== userId);
  await ref.update({ pool: newPool });
  return 'unsigned';
}

module.exports = {
  createMatch,
  getCurrentMatch,
  signToPool,
  abortMatch,
  pickPlayer,
  submitResult,
  removeFromPool
};