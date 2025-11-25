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

async function checkStudentData() {
  try {
    console.log('\n═══════════════════════════════════════════════');
    console.log('  STUDENT DATA STRUCTURE CHECK');
    console.log('═══════════════════════════════════════════════\n');

    // Get the specific student
    const studentId = '47567854';
    const studentSnapshot = await db.ref(`students/${studentId}`).once('value');
    const studentData = studentSnapshot.val();

    if (!studentData) {
      console.log('❌ Student not found:', studentId);
      process.exit(0);
    }

    console.log('📋 Student:', studentData.firstName, studentData.lastName);
    console.log('🆔 Student ID:', studentId);
    console.log('\n📊 Full Student Data:');
    console.log(JSON.stringify(studentData, null, 2));

    console.log('\n👨‍👩‍👧 Guardians:');
    if (studentData.guardians && Array.isArray(studentData.guardians)) {
      studentData.guardians.forEach((guardian, index) => {
        console.log(`\nGuardian ${index + 1}:`);
        console.log('  Name:', guardian.name || guardian.Name || 'N/A');
        console.log('  Email:', guardian.email || guardian.Email || 'N/A');
        console.log('  RFID:', guardian.rfid || guardian.parentRfid || guardian.parentUid || 'N/A');
        console.log('  Relation:', guardian.relation || guardian.Relation || 'N/A');
      });
    } else {
      console.log('  ❌ No guardians array found');
    }

    // Check if there's a parent reference
    console.log('\n🔍 Other parent references:');
    console.log('  studentData.rfid:', studentData.rfid || 'N/A');
    console.log('  studentData.parentRfid:', studentData.parentRfid || 'N/A');
    console.log('  studentData.parentUid:', studentData.parentUid || 'N/A');
    console.log('  studentData.parentEmail:', studentData.parentEmail || 'N/A');

    // Now check if we can find a parent user
    console.log('\n🔍 Looking for parent users...\n');
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();

    let foundParent = false;
    for (const userId in users) {
      const user = users[userId];
      if (user.role === 'parent') {
        // Check all possible matches
        const matches = [];
        
        if (studentData.guardians && Array.isArray(studentData.guardians)) {
          studentData.guardians.forEach(g => {
            const guardianRfid = g.rfid || g.parentRfid || g.parentUid;
            if (guardianRfid && user.guardianRfid === guardianRfid) {
              matches.push(`guardianRfid matches: ${guardianRfid}`);
            }
          });
        }
        
        if (studentData.rfid && user.guardianRfid === studentData.rfid) {
          matches.push(`student.rfid matches: ${studentData.rfid}`);
        }
        
        if (matches.length > 0) {
          foundParent = true;
          console.log('✅ FOUND PARENT MATCH!');
          console.log('   User ID:', userId);
          console.log('   Email:', user.email);
          console.log('   Name:', user.firstname, user.lastname);
          console.log('   Guardian RFID:', user.guardianRfid);
          console.log('   Matches:', matches.join(', '));
          console.log('   Has pushToken:', !!(user.pushToken || user.expoPushToken));
          if (user.pushToken) {
            console.log('   pushToken:', typeof user.pushToken === 'string' ? user.pushToken.substring(0, 30) + '...' : JSON.stringify(user.pushToken));
          }
          if (user.expoPushToken) {
            console.log('   expoPushToken:', typeof user.expoPushToken === 'string' ? user.expoPushToken.substring(0, 30) + '...' : JSON.stringify(user.expoPushToken));
          }
          console.log('');
        }
      }
    }

    if (!foundParent) {
      console.log('❌ No parent user found matching this student');
      console.log('\n💡 Possible reasons:');
      console.log('   1. Parent hasn\'t created an account yet');
      console.log('   2. Guardian RFID doesn\'t match user.guardianRfid field');
      console.log('   3. Parent data structure is different than expected');
    }

    console.log('\n═══════════════════════════════════════════════');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkStudentData();
