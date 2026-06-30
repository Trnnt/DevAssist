const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
db.settings({ databaseId: 'default' });

async function run() {
  try {
    const snapshot = await db.collection('users').get();
    console.log(`Found ${snapshot.size} users:`);
    snapshot.forEach(doc => {
      console.log(doc.id, '=>', doc.data());
    });
  } catch (err) {
    console.error(err);
  }
}

run();
