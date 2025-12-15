// server.js - COMPLETE FIXED VERSION
require('dotenv').config();
console.log("🚀 Starting Notification Server...");

const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://rfidattendance-595f4-default-rtdb.firebaseio.com'
});

const db = admin.database();

console.log('✅ Firebase initialized');
console.log('📡 Database URL:', 'https://rfidattendance-595f4-default-rtdb.firebaseio.com');

// ==================== GLOBAL HELPERS ====================
async function findParentPushTokenByStudentId(studentId) {
  try {
    console.log(`🔍 Looking for parent token for student: ${studentId}`);
    
    // Get student data
    const studentSnapshot = await db.ref(`students/${studentId}`).once('value');
    const studentData = studentSnapshot.val();
    
    if (!studentData) {
      console.log('❌ Student not found:', studentId);
      return null;
    }
    
    console.log('👨‍🎓 Student found:', studentData.firstName);
    
    // Get guardian emails
    let guardianEmails = [];
    if (studentData.guardians) {
      if (Array.isArray(studentData.guardians)) {
        guardianEmails = studentData.guardians.map(g => g.email).filter(Boolean);
      } else if (typeof studentData.guardians === 'object') {
        guardianEmails = Object.values(studentData.guardians)
          .map(g => g.email)
          .filter(Boolean);
      }
    }
    
    console.log('📧 Guardian emails:', guardianEmails);
    
    if (guardianEmails.length === 0) {
      console.log('❌ No guardian emails found');
      return null;
    }
    
    // Search for parent user by email
    for (const email of guardianEmails) {
      console.log(`🔍 Searching for parent with email: ${email}`);
      
      const usersSnapshot = await db.ref('users')
        .orderByChild('email')
        .equalTo(email.toLowerCase())
        .once('value');
      
      if (usersSnapshot.exists()) {
        usersSnapshot.forEach((userSnap) => {
          const userData = userSnap.val();
          console.log('👤 Found parent user:', userSnap.key);
          
          // Check for expoPushToken in various locations
          if (userData.expoPushToken) {
            if (typeof userData.expoPushToken === 'string') {
              console.log('✅ Found expoPushToken (string):', userData.expoPushToken.substring(0, 20) + '...');
              return userData.expoPushToken;
            } else if (userData.expoPushToken.token) {
              console.log('✅ Found expoPushToken (object):', userData.expoPushToken.token.substring(0, 20) + '...');
              return userData.expoPushToken.token;
            }
          }
          
          // Check for pushToken
          if (userData.pushToken && userData.pushToken.token) {
            console.log('✅ Found pushToken:', userData.pushToken.token.substring(0, 20) + '...');
            return userData.pushToken.token;
          }
          
          // Check for fcmToken
          if (userData.fcmToken) {
            console.log('✅ Found fcmToken:', userData.fcmToken.substring(0, 20) + '...');
            return userData.fcmToken;
          }
        });
      }
    }
    
    console.log('❌ No push token found for any guardian');
    return null;
    
  } catch (error) {
    console.error('❌ Error finding parent token:', error);
    return null;
  }
}

async function sendExpoPushNotification(expoPushToken, title, body, data = {}) {
  try {
    if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken[')) {
      console.log('❌ Invalid Expo push token:', expoPushToken);
      return false;
    }
    
    console.log('📤 Sending Expo push notification...');
    console.log('📱 Token:', expoPushToken.substring(0, 30) + '...');
    console.log('📝 Title:', title);
    console.log('📝 Body:', body);
    
    const message = {
      to: expoPushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data,
      priority: 'high',
      channelId: 'default',
      badge: 1,
      ttl: 0
    };
    
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    const result = await response.json();
    console.log('📬 Expo API Response:', JSON.stringify(result, null, 2));
    
    if (result.data) {
      const ticket = result.data[0] || result.data;
      if (ticket && ticket.status === 'ok') {
        console.log('✅ Push notification sent successfully!');
        console.log('🎫 Receipt ID:', ticket.id);
        return true;
      } else {
        console.log('⚠️ Push notification failed with status:', ticket?.status);
        console.log('📄 Error details:', ticket?.message || ticket?.details);
        return false;
      }
    } else {
      console.log('❌ Invalid response from Expo:', result);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Error sending Expo push notification:', error);
    return false;
  }
}

// ==================== TEACHER MESSAGE LISTENER ====================
console.log('👨‍🏫 Setting up teacher message listener...');

const messagesRef = db.ref('messages');
const processedMessages = new Set();

messagesRef.on('child_added', async (studentSnapshot) => {
  const studentId = studentSnapshot.key;
  console.log(`\n📬 New message container for student: ${studentId}`);
  
  // Listen for new messages under this student
  const studentMessagesRef = db.ref(`messages/${studentId}`);
  
  studentMessagesRef.on('child_added', async (messageSnapshot) => {
    const messageId = messageSnapshot.key;
    const message = messageSnapshot.val();
    
    const messageKey = `${studentId}_${messageId}`;
    
    if (processedMessages.has(messageKey)) {
      console.log('⏩ Message already processed:', messageKey);
      return;
    }
    
    // Skip if not a teacher message
    if (message.sender !== 'teacher') {
      console.log('⏩ Skipping non-teacher message');
      processedMessages.add(messageKey);
      return;
    }
    
    // Skip if already read
    if (message.read) {
      console.log('⏩ Skipping already read message');
      processedMessages.add(messageKey);
      return;
    }
    
    processedMessages.add(messageKey);
    console.log(`💬 New teacher message: ${messageId}`);
    console.log(`📝 Message: ${message.text}`);
    
    // Clean up old processed messages
    if (processedMessages.size > 1000) {
      const firstItem = processedMessages.values().next().value;
      processedMessages.delete(firstItem);
    }
    
    try {
      // Get parent push token
      const expoPushToken = await findParentPushTokenByStudentId(studentId);
      
      if (!expoPushToken) {
        console.log('❌ Cannot send notification: No parent token found');
        return;
      }
      
      // Get student name
      const studentSnapshot = await db.ref(`students/${studentId}`).once('value');
      const studentData = studentSnapshot.val();
      const studentName = studentData ? 
        `${studentData.firstName || ''} ${studentData.lastName || ''}`.trim() : 
        'Your child';
      
      // Prepare notification data
      const notificationData = {
        type: 'teacher_message',
        studentId: studentId,
        studentName: studentName,
        teacherName: message.senderName || 'Teacher',
        messageId: messageId,
        messageText: message.text,
        timestamp: message.timestamp || Date.now(),
        screen: 'messages',
        action: 'open_messages'
      };
      
      // Send push notification
      const title = `💬 Message from ${message.senderName || 'Teacher'}`;
      const body = message.text.length > 100 ? 
        message.text.substring(0, 100) + '...' : 
        message.text;
      
      const sent = await sendExpoPushNotification(expoPushToken, title, body, notificationData);
      
      if (sent) {
        console.log('✅ Teacher message notification sent successfully!');
        
        // Create notification record
        const notificationRecord = {
          studentId: studentId,
          studentName: studentName,
          teacherName: message.senderName || 'Teacher',
          message: message.text,
          timestamp: Date.now(),
          type: 'teacher_message',
          delivered: true,
          pushSent: true
        };
        
        // Save to notifications log
        await db.ref('notificationLogs').push(notificationRecord);
        
      } else {
        console.log('❌ Failed to send teacher message notification');
      }
      
    } catch (error) {
      console.error('❌ Error processing teacher message:', error);
    }
  });
});

// ==================== REAL-TIME MESSAGE MONITOR ====================
// Alternative approach: Monitor all messages in real-time
console.log('👁️ Setting up real-time message monitor...');

const allMessagesRef = db.ref('messages');
allMessagesRef.on('value', async (snapshot) => {
  if (!snapshot.exists()) return;
  
  const students = snapshot.val();
  
  for (const studentId in students) {
    const messages = students[studentId];
    
    if (typeof messages !== 'object') continue;
    
    for (const messageId in messages) {
      const message = messages[messageId];
      const messageKey = `${studentId}_${messageId}`;
      
      // Process new unread teacher messages
      if (message.sender === 'teacher' && !message.read && !message.notificationSent) {
        if (processedMessages.has(messageKey)) continue;
        
        processedMessages.add(messageKey);
        console.log(`\n📨 Real-time: New teacher message for ${studentId}`);
        
        try {
          const expoPushToken = await findParentPushTokenByStudentId(studentId);
          
          if (expoPushToken) {
            // Get student info
            const studentSnapshot = await db.ref(`students/${studentId}`).once('value');
            const studentData = studentSnapshot.val();
            const studentName = studentData ? 
              `${studentData.firstName || ''} ${studentData.lastName || ''}`.trim() : 
              'Your child';
            
            // Send notification
            const title = `💬 ${message.senderName || 'Teacher'}`;
            const body = message.text.length > 80 ? 
              message.text.substring(0, 80) + '...' : 
              message.text;
            
            const notificationData = {
              type: 'teacher_message',
              studentId: studentId,
              studentName: studentName,
              teacherName: message.senderName || 'Teacher',
              messageId: messageId,
              timestamp: message.timestamp || Date.now(),
              screen: 'messages'
            };
            
            await sendExpoPushNotification(expoPushToken, title, body, notificationData);
            
            // Mark as notification sent
            await db.ref(`messages/${studentId}/${messageId}`).update({
              notificationSent: true,
              notificationSentAt: Date.now()
            });
            
            console.log('✅ Real-time notification sent and marked');
          }
        } catch (error) {
          console.error('❌ Real-time notification error:', error);
        }
      }
    }
  }
});

// ==================== HEALTH CHECK ENDPOINT ====================
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'notification-server',
    timestamp: new Date().toISOString(),
    processedMessages: processedMessages.size,
    firebaseConnected: true
  });
});

app.post('/send-test-notification', async (req, res) => {
  try {
    const { studentId, message } = req.body;
    
    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required' });
    }
    
    console.log('🧪 Test notification requested for student:', studentId);
    
    const expoPushToken = await findParentPushTokenByStudentId(studentId);
    
    if (!expoPushToken) {
      return res.status(404).json({ error: 'No parent token found for this student' });
    }
    
    const testMessage = message || 'This is a test notification from the server';
    const notificationData = {
      type: 'test_notification',
      studentId: studentId,
      timestamp: Date.now(),
      test: true
    };
    
    const sent = await sendExpoPushNotification(
      expoPushToken, 
      '🧪 Test Notification', 
      testMessage, 
      notificationData
    );
    
    if (sent) {
      res.json({ success: true, message: 'Test notification sent' });
    } else {
      res.status(500).json({ error: 'Failed to send notification' });
    }
    
  } catch (error) {
    console.error('❌ Test notification error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🏥 Health check server running on port ${PORT}`);
  console.log(`📊 Health endpoint: http://localhost:${PORT}/health`);
  console.log(`🧪 Test endpoint: POST http://localhost:${PORT}/send-test-notification`);
});

// ==================== STARTUP LOGS ====================
console.log('\n========================================');
console.log('🔔 NOTIFICATION SERVER STARTED');
console.log('========================================');
console.log('✅ Teacher message listener: ACTIVE');
console.log('✅ Real-time monitor: ACTIVE');
console.log('✅ Health check server: ACTIVE');
console.log('✅ Ready to send push notifications!');
console.log('========================================\n');

// ==================== GRACEFUL SHUTDOWN ====================
process.on('SIGINT', () => {
  console.log('\n🛑 Server shutting down gracefully...');
  console.log(`📊 Total processed messages: ${processedMessages.size}`);
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('⚠️ Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled rejection at:', promise, 'reason:', reason);
});