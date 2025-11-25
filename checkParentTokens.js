// checkParentTokens.js
// Check which parents have push tokens registered

const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
try {
  if (!admin.apps.length) {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: 'https://rfidattendance-595f4-default-rtdb.firebaseio.com'
    });
  }
} catch (error) {
  console.log('Firebase already initialized');
}

const db = admin.database();

async function checkAllParentTokens() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('  PARENT PUSH TOKEN STATUS CHECK');
  console.log('═══════════════════════════════════════════════\n');

  try {
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();

    let totalParents = 0;
    let parentsWithToken = 0;
    let parentsWithoutToken = 0;

    console.log('📋 Parent Accounts:\n');

    for (const userId in users) {
      const user = users[userId];
      
      if (user.role === 'parent') {
        totalParents++;
        
        const name = `${user.firstname || ''} ${user.lastname || ''}`.trim() || 'Unknown';
        const email = user.email || 'No email';
        const guardianRfid = user.guardianRfid || 'No RFID';
        
        // Check for push token in all possible locations
        let hasToken = false;
        let tokenValue = null;
        
        if (user.pushToken && user.pushToken.token) {
          hasToken = true;
          tokenValue = user.pushToken.token;
        } else if (user.expoPushToken && user.expoPushToken.token) {
          hasToken = true;
          tokenValue = user.expoPushToken.token;
        } else if (typeof user.pushToken === 'string') {
          hasToken = true;
          tokenValue = user.pushToken;
        } else if (typeof user.expoPushToken === 'string') {
          hasToken = true;
          tokenValue = user.expoPushToken;
        }

        if (hasToken) {
          parentsWithToken++;
          console.log(`✅ ${name}`);
          console.log(`   Email: ${email}`);
          console.log(`   RFID: ${guardianRfid}`);
          console.log(`   Token: ${tokenValue.substring(0, 30)}...`);
          console.log(`   Status: READY for notifications\n`);
        } else {
          parentsWithoutToken++;
          console.log(`❌ ${name}`);
          console.log(`   Email: ${email}`);
          console.log(`   RFID: ${guardianRfid}`);
          console.log(`   Token: NOT REGISTERED`);
          console.log(`   Status: CANNOT receive notifications`);
          console.log(`   Action: Parent needs to open app and allow notifications\n`);
        }
      }
    }

    console.log('═══════════════════════════════════════════════');
    console.log('SUMMARY:');
    console.log(`Total Parents: ${totalParents}`);
    console.log(`✅ With Push Token: ${parentsWithToken}`);
    console.log(`❌ Without Push Token: ${parentsWithoutToken}`);
    console.log('═══════════════════════════════════════════════\n');

    if (parentsWithoutToken > 0) {
      console.log('⚠️  ACTION REQUIRED:');
      console.log('Parents without tokens need to:');
      console.log('1. Open the parent mobile app');
      console.log('2. Allow notification permissions when prompted');
      console.log('3. Go to home screen to trigger token registration');
      console.log('4. Check this script again to verify\n');
    }

  } catch (error) {
    console.error('❌ Error checking parent tokens:', error);
  }

  process.exit(0);
}

// Run if executed directly
if (require.main === module) {
  checkAllParentTokens();
}

module.exports = { checkAllParentTokens };
