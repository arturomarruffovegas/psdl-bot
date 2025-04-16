const admin = require('firebase-admin');
const serviceAccount = require('../peruvian-streamers-dota-league-firebase-adminsdk-fbsvc-7abc4c13d9.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
module.exports = db;