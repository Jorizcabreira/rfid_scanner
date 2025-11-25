// createParentUser.js - Script to create parent user in Firebase Authentication
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://rfidattendance-595f4-default-rtdb.firebaseio.com'
});

// User details from logs
const parentEmail = 'cjoriz441@gmail.com';
const parentPassword = 'password123'; // Change this to desired password
const parentUid = '4227545631';
const parentName = 'Rommel Cacho';

async function createParentUser() {
  try {
    console.log('🔧 Creating parent user in Firebase Authentication...');
    
    // Check if user already exists
    try {
      const existingUser = await admin.auth().getUserByEmail(parentEmail);
      console.log('⚠️  User already exists!');
      console.log('User UID:', existingUser.uid);
      console.log('Email:', existingUser.email);
      console.log('\n💡 To update password, use Firebase Console or run resetPassword.js');
      return;
    } catch (error) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
      // User doesn't exist, continue to create
    }
    
    // Create new user
    const userRecord = await admin.auth().createUser({
      email: parentEmail,
      password: parentPassword,
      displayName: parentName,
      emailVerified: true // Set to true to skip email verification
    });
    
    console.log('✅ User created successfully!');
    console.log('User UID:', userRecord.uid);
    console.log('Email:', userRecord.email);
    console.log('Display Name:', userRecord.displayName);
    
    // Also create/update entry in Realtime Database
    const db = admin.database();
    
    // Update users node
    await db.ref(`users/${userRecord.uid}`).update({
      email: parentEmail,
      name: parentName,
      role: 'parent',
      parentUid: parentUid,
      createdAt: Date.now(),
      emailVerified: true
    });
    
    console.log('✅ User data saved to Realtime Database');
    
    // Update parents node
    await db.ref(`parents/${userRecord.uid}`).update({
      email: parentEmail,
      name: parentName,
      parentUid: parentUid,
      userId: userRecord.uid,
      createdAt: Date.now()
    });
    
    console.log('✅ Parent data saved to parents collection');
    
    console.log('\n🎉 Setup complete! Parent can now login with:');
    console.log('   Parent UID:', parentUid);
    console.log('   Email:', parentEmail);
    console.log('   Password:', parentPassword);
    
  } catch (error) {
    console.error('❌ Error creating user:', error);
  }
  
  process.exit(0);
}

createParentUser();
