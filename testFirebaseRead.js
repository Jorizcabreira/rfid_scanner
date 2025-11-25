// Test if we can read messages from Firebase using the same config as the app
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getDatabase, ref, onValue, get } = require('firebase/database');

const firebaseConfig = {
  apiKey: "AIzaSyDz7HMpobu3JxTT_m2lnLIGeaA6yKOFj_g",
  authDomain: "rfidattendance-595f4.firebaseapp.com",
  databaseURL: "https://rfidattendance-595f4-default-rtdb.firebaseio.com",
  projectId: "rfidattendance-595f4",
  storageBucket: "rfidattendance-595f4.firebasestorage.app",
  messagingSenderId: "54831415106",
  appId: "1:54831415106:web:6ccfff82ff6c85787652db"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

async function testRead() {
  console.log('🔐 Logging in as parent...');
  
  try {
    // Login with your parent credentials
    const userCredential = await signInWithEmailAndPassword(
      auth, 
      'cjoriz441@gmail.com',
      'yourpassword' // REPLACE WITH ACTUAL PASSWORD
    );
    
    console.log('✅ Logged in as:', userCredential.user.email);
    console.log('User UID:', userCredential.user.uid);
    
    // Try to read messages
    const studentId = '4196846271';
    console.log('\n📨 Testing read access to messages/' + studentId);
    
    const messagesRef = ref(database, `messages/${studentId}`);
    
    // Method 1: Using get() - one time read
    console.log('\n📖 Method 1: Using get() (one-time read)');
    const snapshot = await get(messagesRef);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      console.log('✅ SUCCESS! Can read messages');
      console.log('Total messages:', Object.keys(data).length);
      console.log('First message:', Object.values(data)[0]);
    } else {
      console.log('❌ No data exists at this path');
    }
    
    // Method 2: Using onValue() - real-time listener
    console.log('\n👂 Method 2: Using onValue() (real-time listener)');
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      console.log('📬 Listener triggered!');
      if (snapshot.exists()) {
        const data = snapshot.val();
        console.log('✅ Listener received', Object.keys(data).length, 'messages');
        console.log('Sample message:', Object.values(data)[0]);
      } else {
        console.log('❌ Listener: No data');
      }
      
      unsubscribe();
      process.exit(0);
    }, (error) => {
      console.error('❌ Listener ERROR:', error.code, error.message);
      process.exit(1);
    });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      console.log('\n⏰ Timeout - listener did not trigger');
      unsubscribe();
      process.exit(1);
    }, 5000);
    
  } catch (error) {
    console.error('❌ Error:', error.code, error.message);
    process.exit(1);
  }
}

testRead();
