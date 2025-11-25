const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://rfidattendance-595f4-default-rtdb.firebaseio.com"
  });
}

const db = admin.database();

async function linkParentRfids() {
  try {
    console.log('\n═══════════════════════════════════════════════');
    console.log('  LINKING PARENT RFIDs');
    console.log('═══════════════════════════════════════════════\n');

    // Mapping of email to RFID from student's guardian data
    const emailToRfid = {
      'celiamagbudhicabagay@gmail.com': '658764539',
      'FatemaDimapilis@gmail.com': '765869708',
      'vivianDimapilis@gmail.com': '658764539' // Same as Vivian/Celia
    };

    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();

    let updatedCount = 0;
    for (const userId in users) {
      const user = users[userId];
      
      if (user.role === 'parent' && emailToRfid[user.email]) {
        const rfid = emailToRfid[user.email];
        
        console.log(`📝 Updating ${user.email}...`);
        console.log(`   Setting guardianRfid: ${rfid}`);
        
        await db.ref(`users/${userId}`).update({
          guardianRfid: rfid
        });
        
        console.log(`   ✅ Updated!`);
        updatedCount++;
      }
    }

    console.log(`\n📊 Updated ${updatedCount} parent accounts`);
    console.log('\n✅ Parent RFIDs linked successfully!');
    console.log('\n💡 Now try sending a message from teacher again.');
    console.log('   Notifications should work for parents with push tokens.');
    
    console.log('\n═══════════════════════════════════════════════');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

linkParentRfids();
