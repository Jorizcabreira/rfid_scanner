// Check if parent has push token saved
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://rfidattendance-595f4-default-rtdb.firebaseio.com'
});

const db = admin.database();

async function checkToken() {
  try {
    console.log('🔍 Checking token for parent: cjoriz441@gmail.com');
    console.log('Student ID: 4196846271');
    console.log('');
    
    // Check student data
    console.log('📋 Checking student record...');
    const studentSnapshot = await db.ref('students/4196846271').once('value');
    const studentData = studentSnapshot.val();
    
    if (studentData) {
      console.log('✅ Student found:', studentData.firstName, studentData.lastName);
      console.log('   Parent Email:', studentData.parentEmail);
      console.log('   Parent FCM Token:', studentData.parentFcmToken ? 'EXISTS ✅' : 'NOT FOUND ❌');
      if (studentData.parentFcmToken) {
        console.log('   Token:', studentData.parentFcmToken.substring(0, 50) + '...');
      }
    } else {
      console.log('❌ Student not found');
    }
    
    console.log('');
    
    // Check users table by email
    console.log('📋 Checking users table...');
    const usersSnapshot = await db.ref('users').orderByChild('email').equalTo('cjoriz441@gmail.com').once('value');
    const usersData = usersSnapshot.val();
    
    if (usersData) {
      const parentId = Object.keys(usersData)[0];
      const parentData = usersData[parentId];
      
      console.log('✅ Parent user found:', parentId);
      console.log('   Name:', parentData.firstName || parentData.name);
      console.log('   Email:', parentData.email);
      console.log('   expoPushToken:', parentData.expoPushToken ? 'EXISTS ✅' : 'NOT FOUND ❌');
      
      if (parentData.expoPushToken) {
        console.log('   Token Type:', typeof parentData.expoPushToken);
        if (typeof parentData.expoPushToken === 'object') {
          console.log('   Token (object):', JSON.stringify(parentData.expoPushToken, null, 2));
        } else {
          console.log('   Token (string):', parentData.expoPushToken.substring(0, 50) + '...');
        }
      }
      
      console.log('   fcmToken:', parentData.fcmToken ? 'EXISTS ✅' : 'NOT FOUND ❌');
      if (parentData.fcmToken) {
        console.log('   FCM Token:', parentData.fcmToken.substring(0, 50) + '...');
      }
      
      console.log('');
      
      // Check parents collection
      console.log('📋 Checking parents collection...');
      const parentsSnapshot = await db.ref('parents/' + parentId).once('value');
      const parentsData = parentsSnapshot.val();
      
      if (parentsData) {
        console.log('✅ Parents record found');
        console.log('   expoPushToken:', parentsData.expoPushToken ? 'EXISTS ✅' : 'NOT FOUND ❌');
        console.log('   fcmToken:', parentsData.fcmToken ? 'EXISTS ✅' : 'NOT FOUND ❌');
        
        if (parentsData.expoPushToken) {
          console.log('   Token:', parentsData.expoPushToken.substring(0, 50) + '...');
        }
      } else {
        console.log('❌ No parents record found');
      }
    } else {
      console.log('❌ No user found with email: cjoriz441@gmail.com');
    }
    
    console.log('');
    console.log('✅ Check complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

checkToken();
