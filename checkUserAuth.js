// checkUserAuth.js - Script to check if user exists in Firebase Authentication
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://rfidattendance-595f4-default-rtdb.firebaseio.com'
});


const email = 'cjoriz441@gmail.com'; // The email from error logs
const db = admin.database();

// Demo: Simulate failed login attempts
const failedAttempts = 3; // Change as needed for testing
const deviceInfo = 'Web (checkUserAuth.js test)';

async function logSuspiciousParentLogin(email, attempts, deviceInfo) {
  const log = {
    parentEmail: email,
    action: 'Suspicious Parent Login',
    status: 'suspicious',
    type: 'parent',
    reason: 'Multiple failed login attempts',
    details: `Account locked after ${attempts} failed attempts`,
    attempts: attempts,
    device: deviceInfo,
    timestamp: Date.now(),
    category: 'authentication',
    severity: 'high',
    adminAttentionRequired: true,
    lockoutTriggered: true
  };
  await db.ref('parentSuspiciousLog').push(log);
}


async function checkUser() {
  try {
    console.log('🔍 Checking Firebase Authentication for:', email);
    // Try to get user by email
    const userRecord = await admin.auth().getUserByEmail(email);
    console.log('✅ User EXISTS in Firebase Authentication!');
    console.log('User details:', {
      uid: userRecord.uid,
      email: userRecord.email,
      emailVerified: userRecord.emailVerified,
      disabled: userRecord.disabled,
      creationTime: userRecord.metadata.creationTime,
      lastSignInTime: userRecord.metadata.lastSignInTime
    });
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.log('❌ User DOES NOT EXIST in Firebase Authentication');
      console.log('\n📝 Solution: Create this user account in Firebase Authentication');
      console.log('   Email:', email);
      console.log('   Password: Set a password (e.g., password123)');
      console.log('\n🔧 To create user, run: node createParentUser.js');
    } else {
      // Simulate failed login logic for demo
      if (failedAttempts >= 3) {
        await logSuspiciousParentLogin(email, failedAttempts, deviceInfo);
        console.log('🚨 Suspicious parent login logged to parentSuspiciousLog!');
      }
      console.error('Error checking user:', error);
    }
  }
  process.exit(0);
}

checkUser();
