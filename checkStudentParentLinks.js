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

async function checkStudentParentLinks() {
  try {
    console.log('\n═══════════════════════════════════════════════');
    console.log('  STUDENT-PARENT LINK STATUS');
    console.log('═══════════════════════════════════════════════\n');

    // Get all students
    const studentsSnapshot = await db.ref('students').once('value');
    const students = studentsSnapshot.val();

    // Get all parent users
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();

    // Create a map of guardianRfid to parent users
    const parentsByRfid = {};
    for (const userId in users) {
      const user = users[userId];
      if (user.role === 'parent' && user.guardianRfid) {
        if (!parentsByRfid[user.guardianRfid]) {
          parentsByRfid[user.guardianRfid] = [];
        }
        parentsByRfid[user.guardianRfid].push({
          email: user.email,
          name: `${user.firstname || ''} ${user.lastname || ''}`.trim(),
          hasToken: !!(user.pushToken || user.expoPushToken)
        });
      }
    }

    let totalStudents = 0;
    let linkedStudents = 0;
    let unlinkedStudents = 0;
    let studentsWithTokens = 0;

    const unlinkedList = [];
    const linkedList = [];

    for (const studentId in students) {
      const student = students[studentId];
      totalStudents++;

      const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
      
      // Check if student has guardians
      let hasLinkedParent = false;
      let hasParentWithToken = false;
      const linkedParents = [];

      if (student.guardians && Array.isArray(student.guardians)) {
        for (const guardian of student.guardians) {
          const rfid = guardian.rfid || guardian.parentRfid || guardian.parentUid;
          if (rfid && parentsByRfid[rfid]) {
            hasLinkedParent = true;
            parentsByRfid[rfid].forEach(parent => {
              linkedParents.push(parent);
              if (parent.hasToken) {
                hasParentWithToken = true;
              }
            });
          }
        }
      }

      if (hasLinkedParent) {
        linkedStudents++;
        if (hasParentWithToken) {
          studentsWithTokens++;
        }
        linkedList.push({
          id: studentId,
          name: studentName,
          gradeLevel: student.gradeLevel || 'N/A',
          parents: linkedParents,
          hasToken: hasParentWithToken
        });
      } else {
        unlinkedStudents++;
        unlinkedList.push({
          id: studentId,
          name: studentName,
          gradeLevel: student.gradeLevel || 'N/A',
          guardians: student.guardians || []
        });
      }
    }

    // Display summary
    console.log('📊 SUMMARY:\n');
    console.log(`   Total Students: ${totalStudents}`);
    console.log(`   ✅ Linked to Parent Account: ${linkedStudents}`);
    console.log(`   ❌ Not Linked: ${unlinkedStudents}`);
    console.log(`   📱 Parents with Push Tokens: ${studentsWithTokens}`);
    console.log('');

    // Show students with linked parents
    if (linkedList.length > 0) {
      console.log('\n✅ STUDENTS WITH LINKED PARENTS:\n');
      linkedList.forEach((student, index) => {
        const tokenIcon = student.hasToken ? '📱' : '❌';
        console.log(`${index + 1}. ${tokenIcon} ${student.name} (${student.gradeLevel})`);
        console.log(`   Student ID: ${student.id}`);
        student.parents.forEach(parent => {
          const tokenStatus = parent.hasToken ? '✅ Has token' : '❌ No token';
          console.log(`   👤 ${parent.email} ${tokenStatus}`);
        });
        console.log('');
      });
    }

    // Show unlinked students
    if (unlinkedList.length > 0) {
      console.log('\n❌ STUDENTS WITHOUT LINKED PARENTS:\n');
      unlinkedList.forEach((student, index) => {
        console.log(`${index + 1}. ${student.name} (${student.gradeLevel})`);
        console.log(`   Student ID: ${student.id}`);
        if (student.guardians && student.guardians.length > 0) {
          console.log(`   📋 Guardians in student data:`);
          student.guardians.forEach((g, i) => {
            console.log(`      ${i + 1}. ${g.name || 'N/A'} - ${g.email || 'No email'}`);
            console.log(`         RFID: ${g.rfid || 'No RFID'}`);
          });
        } else {
          console.log(`   ⚠️ No guardian data in student record`);
        }
        console.log('');
      });

      console.log('\n💡 ACTION REQUIRED for unlinked students:');
      console.log('   1. Parents need to create accounts using their guardian emails');
      console.log('   2. Run linkParentRfids.js to link their RFIDs to accounts');
      console.log('   3. Parents need to open app to register push tokens');
    }

    console.log('\n═══════════════════════════════════════════════');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkStudentParentLinks();
