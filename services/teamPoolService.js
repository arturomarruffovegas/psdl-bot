// services/teamPoolService.js
const db            = require('./db');
const playerService = require('./playerService');

// balanceStartTeams must be adapted to accept numTeams
const { balanceStartTeams } = require('./matchService');

/**
 * Create a fresh infinite sign‑up pool.
 * Initializes: pool=[], status="open", teams=null
 */
async function createPool() {
  const ref = db.collection('teamPools').doc('current');
  await ref.set({ pool: [], status: 'open', teams: null });
  return true;
}

/**
 * Fetch the current infinite pool array, but only if it's still open.
 */
async function getPool() {
  const ref = db.collection('teamPools').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return null;
  const data = doc.data();
  return data.status === 'open' ? data.pool : null;
}

/**
 * Sign a user into the infinite pool.
 * Fails if no pool or pool is no longer open.
 */
async function signToPool(userId) {
  const ref = db.collection('teamPools').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return 'no-pool';
  const data = doc.data();
  if (data.status !== 'open') return 'no-pool';

  const pool = data.pool || [];
  if (pool.includes(userId)) return 'already-signed';

  await ref.update({ pool: [...pool, userId] });
  return { status: 'signed', count: pool.length + 1 };
}

/**
 * Discard the current pool entirely.
 */
async function abortPool() {
  const ref = db.collection('teamPools').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.delete();
  return true;
}

/**
 * Split into `numTeams` of 5.  Any extras beyond numTeams*5 are dropped.
 * Persists: status="split", teams:[[…],[…],…]
 */
async function splitTeams(numTeams) {
  const ref = db.collection('teamPools').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return { error: 'no-pool' };

  const data = doc.data();
  if (data.status !== 'open') return { error: 'no-pool' };

  const pool = data.pool || [];
  const needed = numTeams * 5;
  if (pool.length < needed) {
    return { error: 'not-enough', count: pool.length, needed };
  }

  // fetch profiles & drop any nulls
  const profiles = await Promise.all(
    pool.slice(0, needed).map(id => playerService.getPlayerProfileById(id))
  );
  const players = profiles.filter(Boolean);

  // balance into numTeams of 5 each
  const teams = balanceStartTeams(players, numTeams);

  // persist split result
  await ref.update({ status: 'split', teams });

  return { status: 'ready', teams };
}

/**
 * Once splitTeams has run, retrieve the finalized teams.
 * Returns array of teams or null if none.
 */
async function getSplitResult() {
  const ref = db.collection('teamPools').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return null;
  const { status, teams } = doc.data();
  return status === 'split' ? teams : null;
}

module.exports = {
  createPool,
  getPool,
  signToPool,
  abortPool,
  splitTeams,
  getSplitResult
};