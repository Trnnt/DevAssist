const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function run() {
  try {
    console.log(`Test: admin.firestore() with databaseId: 'default' immediately...`);
    const db = admin.firestore();
    db.settings({ databaseId: 'default' });
    await db.collection('test').doc('hello').set({
      message: `Hello default settings`,
      timestamp: new Date()
    });
    console.log(`Success with databaseId 'default'!`);
    return;
  } catch (err) {
    console.error(`Failed with databaseId 'default':`, err.message);
  }
}

run();
