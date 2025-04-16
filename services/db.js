// const admin = require('firebase-admin');
// const serviceAccount = require('../peruvian-streamers-dota-league-firebase-adminsdk-fbsvc-3e25725b75.json');

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });

// const db = admin.firestore();
// module.exports = db;

const admin = require('firebase-admin');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: serviceAccount.project_id,
    privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
    clientEmail: serviceAccount.client_email,
  }),
});

const db = admin.firestore();
module.exports = db;