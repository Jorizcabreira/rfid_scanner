// scripts/sendNoonAlert.js
// Node.js script to send a push notification to all parent devices at 12:00 nn
// Requirements: node-fetch (npm install node-fetch@2)

const fetch = require('node-fetch');
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://rfidattendance-595f4-default-rtdb.firebaseio.com',
});

const db = admin.database();

async function getAllParentTokens() {
  const usersSnap = await db.ref('users').once('value');
  const users = usersSnap.val();
  const tokens = [];
  for (const uid in users) {
    const user = users[uid];
    if (user.role === 'parent' && user.expoPushToken) {
      if (typeof user.expoPushToken === 'string') {
        tokens.push(user.expoPushToken);
      } else if (user.expoPushToken.token) {
        tokens.push(user.expoPushToken.token);
      }
    }
  }
  return tokens;
}

async function sendNoonAlert() {
  const tokens = await getAllParentTokens();
  if (tokens.length === 0) {
    console.log('No parent tokens found.');
    return;
  }
  const messages = tokens.map(token => ({
    to: token,
    sound: 'default',
    title: 'ALERT: 12:00 NN',
    body: 'It is now 12:00 noon. Please be reminded...',
    data: { type: 'noon_alert' },
  }));

  // Expo allows up to 100 notifications per request
  const chunkSize = 100;
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunk = messages.slice(i, i + chunkSize);
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    });
    const data = await response.json();
    console.log('Expo response:', data);
  }
  console.log('Noon alert sent to all parent devices.');
}

sendNoonAlert().then(() => process.exit(0));
