// services/playerService.js
const db = require('./db');

async function fetchAllPlayers() {
    const snapshot = await db.collection('players').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getPlayerProfileById(userId) {
    const doc = await db.collection('players').doc(userId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

async function getPlayerProfileByUsername(discordTag) {
    const normalized = discordTag.trim().toLowerCase();

    const snapshot = await db.collection('players')
        .where('discordTag', '==', normalized)
        .limit(1)
        .get();

    if (snapshot.empty) return null;

    const data = snapshot.docs[0].data();
    return {
        id: snapshot.docs[0].id.trim().toLowerCase(),
        ...data
    };
}

async function registerPlayer(userId, data) {
    const existing = await db.collection('players').doc(userId).get();
    if (existing.exists) return false;

    const normalizedDiscordTag = data.discordTag?.trim().toLowerCase() ?? '';

    await db.collection('players').doc(userId).set({
        ...data,
        discordTag: normalizedDiscordTag,
        registeredAt: new Date().toISOString()
    });

    return true;
}

async function unregisterPlayer(userId) {
    await db.collection('players').doc(userId).delete();
}

async function updatePlayer(userId, updates) {
    await db.collection('players').doc(userId).update(updates);
}

module.exports = {
    fetchAllPlayers,
    getPlayerProfileById,
    getPlayerProfileByUsername,
    registerPlayer,
    unregisterPlayer,
    updatePlayer
};