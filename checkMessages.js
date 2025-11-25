const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://rfidattendance-595f4-default-rtdb.firebaseio.com'
});

const db = admin.database();

async function checkMessages() {
  console.log('🔍 Checking messages in Firebase...\n');

  try {
    // 1. Check all students
    const studentsRef = db.ref('students');
    const studentsSnap = await studentsRef.once('value');
    
    if (!studentsSnap.exists()) {
      console.log('❌ No students found in database');
      return;
    }

    const students = studentsSnap.val();
    console.log(`✅ Found ${Object.keys(students).length} students\n`);

    // 2. Check messages for each student
    for (const [studentId, student] of Object.entries(students)) {
      console.log(`📝 Student: ${student.firstName} ${student.lastName || ''} (ID: ${studentId})`);
      console.log(`   Grade: ${student.gradeLevel} | Section: ${student.section || 'N/A'}`);
      console.log(`   RFID: ${student.rfid || studentId}`);
      
      // Check guardians
      if (student.guardians) {
        const guardians = Array.isArray(student.guardians) 
          ? student.guardians 
          : Object.values(student.guardians);
        
        console.log(`   Guardians:`);
        guardians.forEach((g, idx) => {
          console.log(`     ${idx + 1}. ${g.name} (${g.email})`);
        });
      }

      // Check messages for this student
      const messagesRef = db.ref(`messages/${studentId}`);
      const messagesSnap = await messagesRef.once('value');
      
      if (messagesSnap.exists()) {
        const messages = messagesSnap.val();
        const messageArray = Object.entries(messages);
        console.log(`   ✅ Messages: ${messageArray.length} found`);
        
        messageArray.forEach(([msgId, msg]) => {
          const time = new Date(msg.timestamp).toLocaleString();
          console.log(`      - [${msg.sender}] ${msg.text?.substring(0, 40)}... (${time})`);
        });
      } else {
        console.log(`   ⚠️ Messages: NONE (path: messages/${studentId})`);
      }
      
      console.log('');
    }

    // 3. Check if there are any messages at all
    const allMessagesRef = db.ref('messages');
    const allMessagesSnap = await allMessagesRef.once('value');
    
    if (allMessagesSnap.exists()) {
      const allMessages = allMessagesSnap.val();
      console.log(`\n📊 Total message threads: ${Object.keys(allMessages).length}`);
      
      for (const [studentId, messages] of Object.entries(allMessages)) {
        const count = Object.keys(messages).length;
        console.log(`   Student ID ${studentId}: ${count} messages`);
      }
    } else {
      console.log('\n❌ NO MESSAGES AT ALL in database!');
      console.log('💡 Tip: Try sending a test message from the teacher or parent app first.');
    }

    // 4. Check users for teacher emails
    console.log('\n\n👨‍🏫 Checking Teachers...');
    const usersRef = db.ref('users');
    const usersSnap = await usersRef.once('value');
    
    if (usersSnap.exists()) {
      const users = usersSnap.val();
      const teachers = Object.entries(users).filter(([id, user]) => user.role === 'teacher');
      
      console.log(`✅ Found ${teachers.length} teachers:`);
      teachers.forEach(([id, teacher]) => {
        console.log(`   - ${teacher.firstname} ${teacher.lastname} (${teacher.email})`);
        console.log(`     Grade: ${teacher.gradeLevel || 'N/A'} | Section: ${teacher.section || 'N/A'}`);
      });
    }

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkMessages();
