// test-notification.js
// Quick test to send a notification through your server

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://rfidattendance-595f4-default-rtdb.firebaseio.com'
});

const db = admin.database();

async function testNotification() {
  try {
    console.log('🧪 Testing notification system...');
    
    // Get the first user from your database
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();
    
    if (!users) {
      console.log('❌ No users found in database');
      console.log('📝 You need to open your app first to register a user');
      process.exit(1);
    }
    
    const firstUserId = Object.keys(users)[0];
    console.log('✅ Found user:', firstUserId);
    
    // Check if user has a token
    const tokenSnapshot = await db.ref(`users/${firstUserId}/expoPushToken`).once('value');
    const tokenData = tokenSnapshot.val();
    
    if (!tokenData || !tokenData.token) {
      console.log('❌ User does not have a push token saved');
      console.log('📝 Please:');
      console.log('   1. Open your app on your phone');
      console.log('   2. Grant notification permissions');
      console.log('   3. Wait a few seconds for token to save');
      console.log('   4. Run this test again');
      process.exit(1);
    }
    
    console.log('✅ User has push token:', tokenData.token.substring(0, 30) + '...');
    
    // Create a test notification
    const testNotificationRef = db.ref('notifications').push();
    await testNotificationRef.set({
      toParentId: firstUserId,
      title: '🧪 Test Notification',
      body: 'If you see this, your server is working perfectly! 🎉',
      data: {
        type: 'test',
        timestamp: Date.now()
      },
      urgent: true,
      timestamp: Date.now(),
      sent: false
    });
    
    console.log('✅ Test notification created in Firebase');
    console.log('⏳ Waiting for server to process...');
    
    // Wait and check if it was sent
    setTimeout(async () => {
      const result = await testNotificationRef.once('value');
      const data = result.val();
      
      if (data.sent) {
        console.log('✅ SUCCESS! Notification was sent by server');
        console.log('📱 Check your phone - you should have received a notification!');
      } else {
        console.log('❌ Notification not sent yet');
        console.log('🔍 Check server.js console for errors');
      }
      
      process.exit(0);
    }, 3000);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

console.log('');
console.log('═══════════════════════════════════════════════');
console.log('  🧪 Notification System Test');
console.log('═══════════════════════════════════════════════');
console.log('');

testNotification();
