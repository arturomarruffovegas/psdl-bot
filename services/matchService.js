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

  if (doc.exists) {
    const current = doc.data();

    // If there’s an in‑flight pregame (pending signups or picking),
    // block creation of a new match:
    const isChallengePregame = current.type === 'challenge' && current.status !== 'ready';
    const isStartPregame = current.type === 'start' && current.status !== 'ready';
    if (isChallengePregame || isStartPregame) {
      return null; // still drafting/signing → block
    }

    // Otherwise it must be a match that’s already "ready" (teams set).
    // Tear it down so new drafts can start.
    await ref.delete();
  }

  // Now we know there is no live pregame, so we can create one:
  let data = { type, startedAt: new Date().toISOString(), status: 'pending' };

  if (type === 'challenge') {
    if (!challenged) throw new Error('Challenge type requires a challenged user.');
    data.captain1 = initiator;
    data.captain2 = challenged;
    data.pool = [];
    data.picks = { radiant: [], dire: [] };
  } else if (type === 'start') {
    data.starter = initiator;
    data.pool = [initiator];              // auto‑sign the creator
    data.votes = { radiant: [], dire: [] }; // for result voting later
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
/**
 * Dado un arreglo de 10 jugadores (cada uno con { id, role, tier }),
 * reparte en dos equipos de 5 procurando:
 *  - Ideal: 3 cores y 2 supports.
 *  - Los cores cuentan doble (CORE_WEIGHT = 2) que los supports.
 *  - Cuando un soporte deba jugar de core (faltan cores) o un core deba jugar de support (faltan supports),
 *    se les penaliza reduciendo su tier en 1 para el cálculo.
 */
function balanceStartTeams(players) {
  const CORE_WEIGHT = 2;
  const IDEAL_CORES = 3;
  const IDEAL_SUPPORTS = 2;

  const combinations = getCombinations(players, IDEAL_CORES + IDEAL_SUPPORTS);
  let bestPartition = null;
  let bestCompError = Infinity;
  let bestTierDiff = Infinity;

  function evaluateTeam(team) {
    // 1) contar roles
    let cores = 0;
    let supports = 0;
    for (const p of team) {
      if (p.role.toLowerCase() === 'core') cores++;
      else supports++;
    }

    // 2) determinar cuántos deben cubrir rol ajeno
    let needCore = Math.max(0, IDEAL_CORES - cores);    // soportes que jugarán de core
    let needSupport = Math.max(0, IDEAL_SUPPORTS - supports); // cores que jugarán de support

    // 3) calcular suma de tiers con penalización
    let sumTiers = 0;
    for (const p of team) {
      let effectiveTier = p.tier;
      if (p.role.toLowerCase() === 'support' && needCore > 0) {
        effectiveTier = Math.max(1, effectiveTier - 1);
        needCore--;
      } else if (p.role.toLowerCase() === 'core' && needSupport > 0) {
        effectiveTier = Math.max(1, effectiveTier - 1);
        needSupport--;
      }
      // aplicar peso
      sumTiers += p.role.toLowerCase() === 'core'
        ? effectiveTier * CORE_WEIGHT
        : effectiveTier;
    }

    return { cores, supports, sumTiers };
  }

  for (const team1 of combinations) {
    // calcular team2 complementario
    const team1Ids = new Set(team1.map(p => p.id));
    const team2 = players.filter(p => !team1Ids.has(p.id));
    if (team2.length !== IDEAL_CORES + IDEAL_SUPPORTS) continue;

    const e1 = evaluateTeam(team1);
    const e2 = evaluateTeam(team2);

    // error de composición vs ideal
    const compError =
      Math.abs(e1.cores - IDEAL_CORES) +
      Math.abs(e1.supports - IDEAL_SUPPORTS) +
      Math.abs(e2.cores - IDEAL_CORES) +
      Math.abs(e2.supports - IDEAL_SUPPORTS);

    // diferencia de tiers
    const tierDiff = Math.abs(e1.sumTiers - e2.sumTiers);

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

  // fallback aleatorio
  if (!bestPartition) {
    const shuffled = players.slice().sort(() => Math.random() - 0.5);
    return {
      radiant: shuffled.slice(0, 5).map(p => p.id),
      dire: shuffled.slice(5, 10).map(p => p.id),
    };
  }

  // asignar aleatoriamente Radiant/Dire
  if (Math.random() < 0.5) {
    return {
      radiant: bestPartition.team1,
      dire: bestPartition.team2,
    };
  } else {
    return {
      radiant: bestPartition.team2,
      dire: bestPartition.team1,
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
/**
 * Sign a user into the current match's pool.
 * 
 * Para "start": al llenar el pool se balancean, se archiva y se borra current.
 * Para "challenge": sólo actualiza el pool.
 */
async function signToPool(userId) {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return 'no-match';

  const data = doc.data();

  // --- Bloqueos generales ---
  // 1) Si la partida ya está lista (ready), nadie más puede inscribirse
  if (data.status === 'ready') {
    return 'match-ready';
  }

  // --- Challenge branch ---
  if (data.type === 'challenge') {
    // Solo tras aceptar (!accept → status: 'waiting') pueden firmarse players
    if (data.status !== 'waiting') {
      return 'not-open';
    }
    // Si ya arrancó el draft (picks > 0) no se puede firmar
    const { picks } = data;
    if (picks.radiant.length + picks.dire.length > 0) {
      return 'drafting';
    }
  }

  // --- Duplicate check ---
  if (data.pool.includes(userId)) {
    return 'already-signed';
  }

  // --- Agregar al pool ---
  data.pool.push(userId);

  // === START match logic ===
  if (data.type === 'start') {
    const POOL_SIZE = process.env.START_POOL_SIZE
      ? parseInt(process.env.START_POOL_SIZE, 10)
      : 10;

    // 1) Actualizamos el pool
    await ref.update({ pool: data.pool });

    // 2) Si justo llegamos al máximo, creamos la partida “ongoing”
    if (data.pool.length === POOL_SIZE) {
      // Recuperar perfiles completos
      const profiles = await Promise.all(
        data.pool.map(id => playerService.getPlayerProfileById(id))
      );
      const validPlayers = profiles.filter(Boolean);
      if (validPlayers.length !== POOL_SIZE) return 'pool-error';

      // Balancear equipos
      const teams = balanceStartTeams(validPlayers);

      // Generar lobby y password
      const lobbyName = generateLobbyName();
      const password  = generatePassword();

      // Construir el registro de la partida en curso
      const ongoingRec = {
        createdAt: new Date().toISOString(),
        type: 'start',
        teams: { radiant: teams.radiant, dire: teams.dire },
        votes: { radiant: [], dire: [] }, // se usará luego en submitResult
        lobbyName,
        password
      };

      // 3) Archivarlo en ongoingMatches
      const ongoingRef = await db.collection('ongoingMatches').add(ongoingRec);

      // 4) Borrar matches/current para liberar el pre‑game
      await ref.delete();

      // 5) Devolver payload
      return {
        status:    'ongoing',
        matchId:   ongoingRef.id,
        teams,
        finalized: { lobbyName, password }
      };
    }

    // Si aún no llena, devolvemos el conteo dinámico
    return {
      status:   data.status,
      count:    data.pool.length,
      poolSize: POOL_SIZE
    };
  }

  // === CHALLENGE match branch ===
  // Persistir solo el pool actualizado
  await ref.update({ pool: data.pool });
  return {
    status: data.status,
    count:  data.pool.length
  };
}

/**
 * Abort the current active match (challenge o start).
 * Borra directamente el documento current, liberando para nuevos juegos.
 */
async function abortMatch() {
  const ref = db.collection('matches').doc('current');
  const doc = await ref.get();
  if (!doc.exists) return false;

  // Simplemente borramos—no archivamos.
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

  const radiant  = picks.radiant;
  const dire     = picks.dire;
  const isRadTurn= radiant.length === dire.length;
  const expected = isRadTurn ? captain1 : captain2;
  if (captainId !== expected) return { error: 'not-your-turn' };

  // 1) aplicar el pick
  if (isRadTurn) radiant.push(userId);
  else            dire.push(userId);

  // 2) remover del pool
  const newPool = pool.filter(id => id !== userId);

  // 3) revisar si completamos 5v5
  const MAX_PICKS = process.env.MAX_PICKS
    ? parseInt(process.env.MAX_PICKS, 10)
    : 10;

  if (radiant.length + dire.length === MAX_PICKS) {
    // 4) preparar los equipos definitivos
    const teams     = { radiant: [...radiant], dire: [...dire] };
    const lobbyName = generateLobbyName();
    const password  = generatePassword();

    // 5) crear registro en ongoingMatches
    const ongoingRec = {
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
    const ongoingRef = await db.collection('ongoingMatches').add(ongoingRec);

    // 6) borrar el draft de current para liberar nuevos pre-games
    await ref.delete();

    // 7) devolver payload con detalles de “Match Ready”
    return {
      team:      isRadTurn ? 'Radiant' : 'Dire',
      finalized: { lobbyName, password, teams },
      status:    'ongoing',
      matchId:   ongoingRef.id
    };
  }

  // 8) si seguimos en drafting, persistir cambios y devolver turno
  await ref.update({ pool: newPool, picks });
  return {
    team:      isRadTurn ? 'Radiant' : 'Dire',
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
/**
 * Cierra un match en curso (challenge o start) y lo archiva.
 *
 * @param userId     ID del usuario que invoca el comando (!result)
 * @param captainId  Sólo para challenge: debe coincidir con captain1 o captain2
 * @param resultTeam "radiant" o "dire"
 * @param matchId    ID del documento en ongoingMatches
 */
async function submitResult(userId, captainId, resultTeam, matchId) {
  // 1) Leer de ongoingMatches en lugar de matches/current
  const ref  = db.collection('ongoingMatches').doc(matchId);
  const snap = await ref.get();
  if (!snap.exists) return { error: 'no-match' };
  const data = snap.data();

  // 2) Validar equipo
  if (!['radiant','dire'].includes(resultTeam)) {
    return { error: 'invalid-team' };
  }

  // --- Challenge flow ---
  if (data.type === 'challenge') {
    // Sólo capitanes
    if (![data.captain1, data.captain2].includes(captainId)) {
      return { error: 'not-captain' };
    }
    // Preparar registro final
    const finalRec = {
      createdAt: new Date().toISOString(),
      radiant:   { captain: data.captain1, players: data.teams.radiant.players },
      dire:      { captain: data.captain2, players: data.teams.dire.players },
      winner:    resultTeam,
      lobbyName: data.lobbyName,
      password:  data.password
    };
    // Archivar en finalizedMatches
    const finalDocRef = await db.collection('finalizedMatches').add(finalRec);

    // Ajustar puntos
    const batch = db.batch();
    const delta = 25;
    const winnerTeam = resultTeam === 'radiant'
      ? data.teams.radiant
      : data.teams.dire;
    const loserTeam = resultTeam === 'radiant'
      ? data.teams.dire
      : data.teams.radiant;

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

    // Borrar el documento de ongoingMatches
    await ref.delete();

    return {
      matchId: finalDocRef.id,
      winner:  resultTeam
    };
  }

  // --- Start flow ---
  if (data.type === 'start') {
    // Inicializar votos
    if (!data.votes) data.votes = { radiant: [], dire: [] };
    // Doble voto
    if (data.votes.radiant.includes(userId) || data.votes.dire.includes(userId)) {
      return { error: 'already-voted' };
    }
    // Sólo participantes
    const participants = [...data.teams.radiant.players, ...data.teams.dire.players];
    if (!participants.includes(userId)) {
      return { error: 'not-participant' };
    }
    // Registrar voto
    data.votes[resultTeam].push(userId);
    await ref.update({ votes: data.votes });

    // Si llegamos a 6 votos, finalizamos
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

      // Ajustar puntos
      const batch = db.batch();
      const delta = 25;
      const winnerIds = data.teams[resultTeam].players;
      const loserIds  = data.teams[resultTeam === 'radiant' ? 'dire' : 'radiant'].players;
      for (const pid of winnerIds) {
        const uref = db.collection('players').doc(pid);
        const usnap = await uref.get();
        if (usnap.exists) {
          const pts = usnap.data().points ?? 1000;
          batch.update(uref, { points: pts + delta });
        }
      }
      for (const pid of loserIds) {
        const uref = db.collection('players').doc(pid);
        const usnap = await uref.get();
        if (usnap.exists) {
          const pts = usnap.data().points ?? 1000;
          batch.update(uref, { points: pts - delta });
        }
      }
      await batch.commit();

      // Borrar ongoingMatches
      await ref.delete();

      return {
        status:  'finalized',
        matchId: finalDocRef.id,
        winner:  resultTeam
      };
    }

    // Aún en votación
    return {
      status: 'pending',
      votes:  data.votes
    };
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