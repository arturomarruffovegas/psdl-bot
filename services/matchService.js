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
function balanceStartTeams(players) {
  const combinations = getCombinations(players, 5);
  let bestPartition = null;
  let bestCompError = Infinity;
  let bestTierDiff = Infinity;

  // Helper: count roles and sum tiers for a given team (array of player objects).
  function evaluateTeam(team) {
    let cores = 0, supports = 0, sumTiers = 0;
    for (const p of team) {
      if (p.role.toLowerCase() === 'core') cores++;
      else if (p.role.toLowerCase() === 'support') supports++;
      sumTiers += p.tier;
    }
    return { cores, supports, sumTiers };
  }

  for (const team1 of combinations) {
    // team2 is the complement of team1 within players.
    const team1Ids = new Set(team1.map(p => p.id));
    const team2 = players.filter(p => !team1Ids.has(p.id));
    if (team2.length !== 5) continue; // Should always be true.
    const eval1 = evaluateTeam(team1);
    const eval2 = evaluateTeam(team2);
    // Composition error: deviation from ideal: 3 cores and 2 supports per team.
    const compError = Math.abs(eval1.cores - 3) + Math.abs(eval1.supports - 2) +
      Math.abs(eval2.cores - 3) + Math.abs(eval2.supports - 2);
    const tierDiff = Math.abs(eval1.sumTiers - eval2.sumTiers);

    // Prefer partitions with lower composition error; then lower tier difference.
    if (compError < bestCompError || (compError === bestCompError && tierDiff < bestTierDiff)) {
      bestPartition = { team1: team1.map(p => p.id), team2: team2.map(p => p.id) };
      bestCompError = compError;
      bestTierDiff = tierDiff;
    }
  }

  if (!bestPartition) {
    // Fallback: simple random assignment.
    const shuffled = players.slice().sort(() => Math.random() - 0.5);
    return { radiant: shuffled.slice(0, 5).map(p => p.id), dire: shuffled.slice(5, 10).map(p => p.id) };
  }

  // Randomly decide which partition becomes Radiant and which becomes Dire.
  if (Math.random() < 0.5) {
    return { radiant: bestPartition.team1, dire: bestPartition.team2 };
  } else {
    return { radiant: bestPartition.team2, dire: bestPartition.team1 };
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

  data.pool.push(userId);

  if (data.type === 'start') {
    if (data.pool.length > 10) return 'pool-full';
    await ref.update({ pool: data.pool });
    if (data.pool.length === 10) {
      // Fetch detailed profiles for all 10 players.
      const players = await Promise.all(data.pool.map(id => playerService.getPlayerProfileById(id)));
      const validPlayers = players.filter(p => p); // remove nulls if any
      if (validPlayers.length !== 10) return 'pool-error';
      const teams = balanceStartTeams(validPlayers);
      await ref.update({
        teams: teams,
        status: 'ready'
      });
      return { status: 'ready', teams: teams };
    }
    return { status: data.status, count: data.pool.length };
  }

  // For a challenge match, simply update the pool.
  await ref.update({ pool: data.pool });
  return { status: data.status, count: data.pool.length };
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
  if (!pool.includes(userId)) return { error: 'not-in-pool' };
  if (![captain1, captain2].includes(captainId)) return { error: 'not-captain' };

  const radiant = picks.radiant;
  const dire = picks.dire;
  const isRadiantTurn = radiant.length === dire.length;
  const isCaptainTurn =
    (isRadiantTurn && captainId === captain1) ||
    (!isRadiantTurn && captainId === captain2);
  if (!isCaptainTurn) return { error: 'not-your-turn' };

  if (isRadiantTurn) radiant.push(userId);
  else dire.push(userId);

  const newPool = pool.filter(id => id !== userId);
  const MAX_PICKS = process.env.MAX_PICKS ? parseInt(process.env.MAX_PICKS) : 10;
  let finalized = null;
  if (radiant.length + dire.length === MAX_PICKS) {
    finalized = {
      lobbyName: generateLobbyName(),
      password: generatePassword(),
      status: 'ready'
    };
    await db.collection('finalizedMatches').add({
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
    picks: picks,
    ...(finalized || {})
  });
  return { team: isRadiantTurn ? 'Radiant' : 'Dire', finalized };
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
async function submitResult(userId, captainId, resultTeam) {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return { error: 'no-match' };
  const data = doc.data();

  if (!['radiant', 'dire'].includes(resultTeam))
    return { error: 'invalid-team' };

  if (data.type === 'challenge') {
    if (![data.captain1, data.captain2].includes(captainId))
      return { error: 'not-captain' };

    await ref.update({ winner: resultTeam });
    const winnerTeam = resultTeam === 'radiant' ? data.radiant : data.dire;
    const loserTeam = resultTeam === 'radiant' ? data.dire : data.radiant;
    const pointDelta = 25;
    const batch = db.batch();

    for (const pid of winnerTeam.players.concat(winnerTeam.captain)) {
      const userRef = db.collection('players').doc(pid);
      const snap = await userRef.get();
      if (snap.exists) {
        const points = snap.data().points || 1000;
        batch.update(userRef, { points: points + pointDelta });
      }
    }
    for (const pid of loserTeam.players.concat(loserTeam.captain)) {
      const userRef = db.collection('players').doc(pid);
      const snap = await userRef.get();
      if (snap.exists) {
        const points = snap.data().points || 1000;
        batch.update(userRef, { points: points - pointDelta });
      }
    }
    await batch.commit();
    await ref.delete();
    return { matchId: doc.id, winner: resultTeam };
  } else if (data.type === 'start') {
    if (!data.votes) data.votes = { radiant: [], dire: [] };
    if (data.votes.radiant.includes(userId) || data.votes.dire.includes(userId))
      return { error: 'already-voted' };

    data.votes[resultTeam].push(userId);
    await ref.update({ votes: data.votes });

    if (data.votes[resultTeam].length >= 6) {
      await ref.update({ winner: resultTeam });
      const finalizedRecord = {
        createdAt: new Date().toISOString(),
        radiant: { players: data.teams.radiant },
        dire: { players: data.teams.dire },
        winner: resultTeam,
        lobbyName: generateLobbyName(),
        password: generatePassword()
      };
      await db.collection('finalizedMatches').add(finalizedRecord);
      await ref.delete();
      return { status: 'finalized', winner: resultTeam, match: finalizedRecord };
    }
    return { status: 'pending', votes: data.votes };
  }
}

module.exports = {
  createMatch,
  getCurrentMatch,
  signToPool,
  abortMatch,
  pickPlayer,
  submitResult
};