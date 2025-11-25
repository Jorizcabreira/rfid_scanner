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

async function autoLinkAllParents() {
  try {
    console.log('\n═══════════════════════════════════════════════');
    console.log('  AUTO-LINKING ALL PARENTS TO STUDENTS');
    console.log('═══════════════════════════════════════════════\n');

    // Get all students
    const studentsSnapshot = await db.ref('students').once('value');
    const students = studentsSnapshot.val();

    // Get all parent users
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();

    // Build email to RFID mapping from students' guardian data
    const emailToRfidMap = {};
    
    console.log('🔍 Building email-to-RFID map from student guardian data...\n');
    
    for (const studentId in students) {
      const student = students[studentId];
      if (student.guardians && Array.isArray(student.guardians)) {
        student.guardians.forEach(guardian => {
          const email = guardian.email || guardian.Email;
          const rfid = guardian.rfid || guardian.parentRfid || guardian.parentUid;
          
          if (email && rfid) {
            // Normalize email to lowercase
            const normalizedEmail = email.toLowerCase();
            if (!emailToRfidMap[normalizedEmail]) {
              emailToRfidMap[normalizedEmail] = rfid;
              console.log(`   📧 ${email} → RFID: ${rfid}`);
            }
          }
        });
      }
    }

    console.log(`\n✅ Found ${Object.keys(emailToRfidMap).length} unique guardian emails with RFIDs\n`);

    // Now update parent users with matching emails
    let updatedCount = 0;
    let alreadyLinkedCount = 0;
    let notFoundCount = 0;

    console.log('🔗 Linking parent accounts...\n');

    for (const userId in users) {
      const user = users[userId];
      
      if (user.role === 'parent' && user.email) {
        const normalizedEmail = user.email.toLowerCase();
        const rfid = emailToRfidMap[normalizedEmail];

        if (rfid) {
          // Check if already has guardianRfid
          if (user.guardianRfid === rfid) {
            alreadyLinkedCount++;
            console.log(`   ✓ Already linked: ${user.email}`);
          } else {
            // Update with guardianRfid
            await db.ref(`users/${userId}`).update({
              guardianRfid: rfid
            });
            updatedCount++;
            console.log(`   ✅ LINKED: ${user.email} → RFID: ${rfid}`);
          }
        } else {
          notFoundCount++;
          console.log(`   ⚠️  No matching guardian: ${user.email}`);
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('📊 SUMMARY:\n');
    console.log(`   ✅ Newly Linked: ${updatedCount}`);
    console.log(`   ✓ Already Linked: ${alreadyLinkedCount}`);
    console.log(`   ⚠️  No Match Found: ${notFoundCount}`);
    console.log(`   📧 Total Guardian Emails: ${Object.keys(emailToRfidMap).length}`);
    console.log('═══════════════════════════════════════════════\n');

    if (updatedCount > 0) {
      console.log('✅ Parent linking completed successfully!');
      console.log('\n💡 Next steps:');
      console.log('   1. Run: node checkStudentParentLinks.js (to verify)');
      console.log('   2. Parents need to open app to register push tokens');
      console.log('   3. Run: node checkParentTokens.js (to check token status)');
    }

    console.log('');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

autoLinkAllParents();
