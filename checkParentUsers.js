const admin = require('firebase-admin');

// Initialize Firebase Admin (reuse existing initialization)
if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://rfidattendance-595f4-default-rtdb.firebaseio.com"
  });
}

const db = admin.database();

async function checkParentUsers() {
  try {
    console.log('\n═══════════════════════════════════════════════');
    console.log('  PARENT USER DATA CHECK');
    console.log('═══════════════════════════════════════════════\n');

    const emails = [
      'celiamagbudhicabagay@gmail.com',
      'FatemaDimapilis@gmail.com',
      'vivianDimapilis@gmail.com'
    ];

    console.log('🔍 Looking for parent users with these emails:\n');
    
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();

    let foundCount = 0;
    for (const userId in users) {
      const user = users[userId];
      if (user.role === 'parent' && emails.includes(user.email)) {
        foundCount++;
        console.log(`✅ FOUND: ${user.email}`);
        console.log(`   User ID: ${userId}`);
        console.log(`   Name: ${user.firstname || 'N/A'} ${user.lastname || 'N/A'}`);
        console.log(`   guardianRfid: ${user.guardianRfid || 'NOT SET'}`);
        console.log(`   rfid: ${user.rfid || 'NOT SET'}`);
        console.log(`   parentRfid: ${user.parentRfid || 'NOT SET'}`);
        console.log(`   Has pushToken: ${!!(user.pushToken || user.expoPushToken)}`);
        if (user.pushToken) {
          const token = typeof user.pushToken === 'string' ? user.pushToken : user.pushToken.token;
          console.log(`   pushToken: ${token ? token.substring(0, 30) + '...' : 'N/A'}`);
        }
        if (user.expoPushToken) {
          const token = typeof user.expoPushToken === 'string' ? user.expoPushToken : user.expoPushToken.token;
          console.log(`   expoPushToken: ${token ? token.substring(0, 30) + '...' : 'N/A'}`);
        }
        console.log('');
      }
    }

    if (foundCount === 0) {
      console.log('❌ No parent users found with these emails');
      console.log('\n💡 This means the parents need to:');
      console.log('   1. Sign up with their correct email addresses');
      console.log('   2. Link their guardianRfid during signup');
    } else {
      console.log(`\n📊 Found ${foundCount} parent users`);
      console.log('\n🔍 Expected Guardian RFIDs from student:');
      console.log('   • 658764539 (Vivian Dimapilis - celiamagbudhicabagay@gmail.com)');
      console.log('   • 765869708 (Fatema Dimapilis - FatemaDimapilis@gmail.com)');
    }

    console.log('\n═══════════════════════════════════════════════');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkParentUsers();
