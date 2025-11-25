// Update student record with parent email
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://rfidattendance-595f4-default-rtdb.firebaseio.com'
});

const db = admin.database();

async function updateStudentEmail() {
  try {
    console.log('🔧 Updating student 4196846271 with parent email...');
    
    const studentRef = db.ref('students/4196846271');
    await studentRef.update({
      parentEmail: 'cjoriz441@gmail.com'
    });
    
    console.log('✅ Student record updated successfully!');
    
    // Verify
    const snapshot = await studentRef.once('value');
    const data = snapshot.val();
    console.log('✅ Verified - Parent Email:', data.parentEmail);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
  
  process.exit(0);
}

updateStudentEmail();
