// checkParentData.js - Debug script to check parent credentials in Firebase
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://rfidattendance-595f4-default-rtdb.firebaseio.com'
});

const db = admin.database();

// Change these to the credentials you're testing
const TEST_PARENT_UID = '4227545631';  // Change this
const TEST_EMAIL = 'cjoriz441@gmail.com';  // Change this

async function checkParentData() {
  try {
    console.log('🔍 Checking Firebase data for parent credentials...\n');
    console.log('Searching for:');
    console.log('  Parent UID:', TEST_PARENT_UID);
    console.log('  Email:', TEST_EMAIL);
    console.log('─'.repeat(60));
    
    const studentsRef = db.ref('students');
    const snapshot = await studentsRef.once('value');
    
    if (!snapshot.exists()) {
      console.log('❌ No students found in database');
      process.exit(1);
    }
    
    const students = snapshot.val();
    let foundMatch = false;
    
    console.log('\n📊 Scanning all students...\n');
    
    for (const studentId in students) {
      const student = students[studentId];
      const studentName = student.name || student.firstName || 'Unknown';
      
      if (student.guardians) {
        console.log(`\n👤 Student: ${studentName} (${studentId})`);
        
        // Check if guardians is array or object
        const guardiansList = Array.isArray(student.guardians) 
          ? student.guardians 
          : Object.values(student.guardians);
        
        console.log(`   Guardians (${guardiansList.length}):`);
        
        guardiansList.forEach((guardian, index) => {
          const guardianRfid = guardian.rfid || guardian.parentUid || guardian.parentRfid;
          const guardianEmail = guardian.email || guardian.Email || 'No email';
          const guardianName = guardian.name || guardian.Name || 'No name';
          
          console.log(`   [${index + 1}] Name: ${guardianName}`);
          console.log(`       RFID/UID: ${guardianRfid || 'None'}`);
          console.log(`       Email: ${guardianEmail}`);
          
          // Check for match
          const uidMatch = guardianRfid && guardianRfid.trim() === TEST_PARENT_UID.trim();
          const emailMatch = guardianEmail.toLowerCase().trim() === TEST_EMAIL.toLowerCase().trim();
          
          if (uidMatch && emailMatch) {
            console.log('\n       ✅ ✅ ✅ MATCH FOUND! ✅ ✅ ✅');
            foundMatch = true;
          } else if (uidMatch) {
            console.log('       ⚠️  UID matches but email differs');
          } else if (emailMatch) {
            console.log('       ⚠️  Email matches but UID differs');
          }
        });
      } else {
        console.log(`\n👤 Student: ${studentName} (${studentId}) - No guardians`);
      }
    }
    
    console.log('\n' + '─'.repeat(60));
    
    if (foundMatch) {
      console.log('\n✅ SUCCESS: Parent credentials found in database!');
      console.log('   The credentials should work for login.');
    } else {
      console.log('\n❌ NOT FOUND: No matching parent credentials');
      console.log('\nPossible issues:');
      console.log('  1. Parent UID is incorrect');
      console.log('  2. Email is incorrect or has typo');
      console.log('  3. Guardian data not added to student record');
      console.log('  4. Parent UID stored in different field (check above)');
      console.log('\nCheck the data structure above to see what fields are available.');
    }
    
    console.log('\n' + '─'.repeat(60));
    console.log('\n💡 TIP: If you see the data but no match, check:');
    console.log('   • Extra spaces in UID or email');
    console.log('   • Case sensitivity in email');
    console.log('   • Field names (rfid vs parentUid vs parentRfid)');
    console.log('   • Guardian structure (array vs object)');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkParentData();
