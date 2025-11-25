// firebaseConfig.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDz7HMpobu3JxTT_m2lnLIGeaA6yKOFj_g",
  authDomain: "rfidattendance-595f4.firebaseapp.com",
  databaseURL: "https://rfidattendance-595f4-default-rtdb.firebaseio.com",
  projectId: "rfidattendance-595f4",
  storageBucket: "rfidattendance-595f4.firebasestorage.app",
  messagingSenderId: "54831415106",
  appId: "1:54831415106:web:6ccfff82ff6c85787652db"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
const auth = getAuth(app);

// Initialize Realtime Database and get a reference to the service
const database = getDatabase(app);

export { auth, database };