// server.js
const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://rfidattendance-595f4-default-rtdb.firebaseio.com'
});

const db = admin.database();

console.log('🚀 Notification Server Started');
console.log('📡 Listening for notification requests...');

// Listen for new notification requests
const notificationsRef = db.ref('notifications');

notificationsRef.on('child_added', async snapshot => {
  const notif = snapshot.val();
  const key = snapshot.key;
  

  if (!notif || notif.sent) {
    return; // Skip if already sent
  }

  // === BACKEND DEDUPLICATION FOR ATTENDANCE SCAN NOTIFICATIONS ===
  // Only allow one attendance_scan per student per day per action
  if (notif.data && notif.data.type === 'attendance_scan') {
    const studentRfid = notif.data.studentRfid || notif.data.studentId || notif.data.rfid;
    const action = notif.data.action || notif.data.status || 'Time In';
    // Try to extract date from notif.data.time (format: 'YYYY-MM-DD HH:mm:ss')
    let date = '';
    if (notif.data.time) {
      date = notif.data.time.split(' ')[0];
    } else if (notif.data.timestamp) {
      // Fallback: get date from timestamp
      const d = new Date(notif.data.timestamp);
      date = d.toISOString().split('T')[0];
    }
    if (studentRfid && date && action) {
      const dedupKey = `attendanceNotifSent/${studentRfid}/${date}/${action}`;
      const alreadySentSnap = await db.ref(dedupKey).once('value');
      if (alreadySentSnap.exists()) {
        console.log('⏩ Attendance scan notification already sent for this student/date/action:', dedupKey);
        await snapshot.ref.update({ sent: true, skipped: true, skippedAt: Date.now(), reason: 'deduplicated' });
        return;
      }
      // Mark as sent before actually sending (to prevent race conditions)
      await db.ref(dedupKey).set({ sent: true, sentAt: Date.now() });
    }
  }

  try {
    console.log('📨 New notification request:', notif.title);
    
    // Get parent's Expo Push Token (try multiple locations)
    let expoPushToken = null;
    
    // Try location 1: /users/{userId}/expoPushToken
    const parentSnap = await db.ref(`users/${notif.toParentId}/expoPushToken`).once('value');
    const parentData = parentSnap.val();
    
    if (parentData && parentData.token) {
      expoPushToken = parentData.token;
      console.log('✅ Found token in users/{userId}/expoPushToken');
    } else {
      // Try location 2: /parents/{userId}
      const altParentSnap = await db.ref(`parents/${notif.toParentId}`).once('value');
      const altParentData = altParentSnap.val();
      
      if (altParentData && (altParentData.fcmToken || altParentData.expoPushToken)) {
        expoPushToken = altParentData.fcmToken || altParentData.expoPushToken;
        console.log('✅ Found token in parents/{userId}');
      }
    }

    if (!expoPushToken) {
      console.log('❌ No token found for parent:', notif.toParentId);
      await snapshot.ref.update({ 
        sent: true, 
        error: 'No token found', 
        sentAt: Date.now() 
      });
      return;
    }

    console.log('📤 Sending push notification via Expo...');

    // Determine if this is a pickup confirmation request
    const isPickupReminder = notif.data && (
      notif.data.type === 'reminder' || 
      notif.data.type === 'pickup_reminder_alert' ||
      notif.data.type === 'daily_reminder_1230_2100' ||
      notif.data.type === 'forgot_scan_reminder'
    );

    // Send via Expo Push Notification Service with HIGH priority
    // This will make notification appear even on locked screen
    const message = {
      to: expoPushToken,
      sound: 'default',
      title: notif.title,
      body: notif.body,
      data: notif.data || {},
      priority: 'high',  // Always high priority for immediate delivery
      channelId: 'default',
      badge: 1,
      ttl: 0,  // Deliver immediately, don't queue
      // Add category for action buttons
      categoryId: isPickupReminder ? 'PICKUP_CONFIRMATION' : undefined
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    
    // Check for success (Expo returns { data: { status: 'ok', id: '...' } })
    if (result.data) {
      if (result.data.status === 'ok') {
        console.log('✅ Notification sent successfully!');
        console.log('📬 Receipt ID:', result.data.id);
      } else if (result.data[0] && result.data[0].status === 'ok') {
        console.log('✅ Notification sent successfully!');
        console.log('📬 Receipt ID:', result.data[0].id);
      } else {
        console.log('⚠️ Notification sent but with status:', result.data.status || result.data[0]?.status);
        console.log('Details:', result.data.message || result.data[0]?.message || result);
      }
    } else {
      console.log('⚠️ Unexpected response:', result);
    }

    // Mark as sent
    await snapshot.ref.update({ 
      sent: true, 
      sentAt: Date.now(),
      response: result
    });

  } catch (err) {
    console.error('❌ Error sending notification:', err);
    await snapshot.ref.update({ 
      sent: false, 
      error: err.message,
      errorAt: Date.now()
    });
  }
});

console.log('✅ Server is running and listening for notifications');
console.log('📍 Database URL:', 'https://rfidattendance-595f4-default-rtdb.firebaseio.com');
console.log('🔔 Ready to send push notifications!');

// ==================== TEACHER MESSAGE LISTENER ====================
// Listen for new teacher messages and send push notifications to parents
console.log('👨‍🏫 Setting up teacher message listener...');

const messagesRef = db.ref('messages');
const processedMessages = new Set(); // Track processed messages to avoid duplicates

messagesRef.on('child_changed', async (snapshot) => {
  const studentId = snapshot.key;
  const messagesData = snapshot.val();
  
  if (!messagesData) return;
  
  console.log(`📬 Messages updated for student: ${studentId}`);
  
  // Find the latest teacher message
  const messages = Object.entries(messagesData)
    .map(([id, data]) => ({ id, ...data }))
    .filter(msg => msg.sender === 'teacher' && !msg.read)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  
  if (messages.length === 0) {
    console.log('No unread teacher messages found');
    return;
  }
  
  const latestMessage = messages[0];
  const messageKey = `${studentId}_${latestMessage.id}`;
  
  // Skip if already processed
  if (processedMessages.has(messageKey)) {
    console.log('Message already processed:', messageKey);
    return;
  }
  
  processedMessages.add(messageKey);
  
  // Clean up old processed messages (keep last 100)
  if (processedMessages.size > 100) {
    const firstItem = processedMessages.values().next().value;
    processedMessages.delete(firstItem);
  }
  
  try {
    console.log(`💬 New teacher message for student ${studentId}:`, latestMessage.text.substring(0, 50));
    
    // Get student data to find parent
    const studentSnapshot = await db.ref(`students/${studentId}`).once('value');
    const studentData = studentSnapshot.val();
    
    if (!studentData) {
      console.log('❌ Student not found:', studentId);
      return;
    }
    
    const studentName = `${studentData.firstName || ''} ${studentData.lastName || ''}`.trim();
    console.log(`👨‍👩‍👧 Student: ${studentName}`);
    
    // Find parent's Expo Push Token
    let expoPushToken = null;
    
    // Try to get parent FCM token from students/{studentId}/parentFcmToken
    if (studentData.parentFcmToken) {
      expoPushToken = studentData.parentFcmToken;
      console.log('✅ Found token in student.parentFcmToken');
    } 
    // Try users table by parent email
    else if (studentData.parentEmail) {
      console.log('🔍 Looking up parent by email:', studentData.parentEmail);
      const usersSnapshot = await db.ref('users').orderByChild('email').equalTo(studentData.parentEmail).once('value');
      const usersData = usersSnapshot.val();
      
      if (usersData) {
        const parentId = Object.keys(usersData)[0];
        const parentData = usersData[parentId];
        console.log('👤 Found parent user:', parentId);
        
        // Check expoPushToken object structure (has token property)
        if (parentData.expoPushToken) {
          if (typeof parentData.expoPushToken === 'string') {
            expoPushToken = parentData.expoPushToken;
            console.log('✅ Found token (string) in users/{parentId}/expoPushToken');
          } else if (parentData.expoPushToken.token) {
            expoPushToken = parentData.expoPushToken.token;
            console.log('✅ Found token (object) in users/{parentId}/expoPushToken.token');
          }
        }
        // Fallback to fcmToken
        if (!expoPushToken && parentData.fcmToken) {
          expoPushToken = parentData.fcmToken;
          console.log('✅ Found token in users/{parentId}/fcmToken');
        }
        
        // Additional fallback: Check parents/{parentId}
        if (!expoPushToken) {
          const parentsSnapshot = await db.ref(`parents/${parentId}`).once('value');
          const parentsData = parentsSnapshot.val();
          if (parentsData) {
            if (parentsData.expoPushToken) {
              expoPushToken = parentsData.expoPushToken;
              console.log('✅ Found token in parents/{parentId}/expoPushToken');
            } else if (parentsData.fcmToken) {
              expoPushToken = parentsData.fcmToken;
              console.log('✅ Found token in parents/{parentId}/fcmToken');
            }
          }
        }
      } else {
        console.log('❌ No user found with email:', studentData.parentEmail);
      }
    } else {
      console.log('❌ No parent email found in student data');
    }
    
    if (!expoPushToken) {
      console.log('❌ No push token found for parent of student:', studentId);
      return;
    }
    
    console.log('📤 Sending push notification to parent...');
    
    // Send via Expo Push Notification Service
    const message = {
      to: expoPushToken,
      sound: 'default',
      title: `💬 ${latestMessage.senderName || 'Teacher'}`,
      body: latestMessage.text.substring(0, 100) + (latestMessage.text.length > 100 ? '...' : ''),
      data: {
        type: 'teacher_message',
        studentId: studentId,
        studentName: studentName,
        teacherName: latestMessage.senderName || 'Teacher',
        messageId: latestMessage.id,
        timestamp: latestMessage.timestamp || Date.now()
      },
      priority: 'high',
      channelId: 'messages',
      badge: 1,
      ttl: 0
    };
    
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    const result = await response.json();
    
    if (result.data) {
      if (result.data.status === 'ok' || (result.data[0] && result.data[0].status === 'ok')) {
        console.log('✅ Teacher message notification sent successfully!');
        console.log('📬 Receipt ID:', result.data.id || result.data[0]?.id);
      } else {
        console.log('⚠️ Notification sent with status:', result.data.status || result.data[0]?.status);
      }
    } else {
      console.log('⚠️ Unexpected response:', result);
    }
    
  } catch (err) {
    console.error('❌ Error sending teacher message notification:', err);
  }
});

console.log('✅ Teacher message listener active!');

// ==================== MANUAL ATTENDANCE LISTENER ====================
// Listen for manual attendance entries and send notifications to parents
console.log('📝 Setting up manual attendance listener...');

const manualAttendanceRef = db.ref('manualAttendance');
const processedManualEntries = new Set();

manualAttendanceRef.on('child_added', async (snapshot) => {
  const entryKey = snapshot.key;
  const entry = snapshot.val();
  
  if (!entry || processedManualEntries.has(entryKey)) {
    return;
  }
  
  processedManualEntries.add(entryKey);
  
  // Clean up old processed entries
  if (processedManualEntries.size > 200) {
    const firstItem = processedManualEntries.values().next().value;
    processedManualEntries.delete(firstItem);
  }
  
  try {
    console.log(`📝 New manual attendance entry for: ${entry.studentName}`);
    console.log(`   Status: ${entry.status}, Reason: ${entry.reason}`);
    
    // Get student data to find parent token
    const studentSnapshot = await db.ref(`students/${entry.studentRfid}`).once('value');
    const studentData = studentSnapshot.val();
    
    if (!studentData) {
      console.log('❌ Student not found:', entry.studentRfid);
      return;
    }
    
    // Find parent's Expo Push Token
    let expoPushToken = null;
    let parentId = null;
    
    // Get parent email from guardians
    let parentEmail = null;
    if (studentData.guardians) {
      const guardians = Array.isArray(studentData.guardians) 
        ? studentData.guardians 
        : Object.values(studentData.guardians);
      
      if (guardians.length > 0) {
        parentEmail = guardians[0].email;
      }
    }
    
    if (!parentEmail) {
      console.log('❌ No parent email found for student:', entry.studentRfid);
      return;
    }
    
    console.log('🔍 Looking up parent by email:', parentEmail);
    
    // Find parent user by email
    const usersSnapshot = await db.ref('users').orderByChild('email').equalTo(parentEmail).once('value');
    const usersData = usersSnapshot.val();
    
    if (usersData) {
      parentId = Object.keys(usersData)[0];
      const parentData = usersData[parentId];
      console.log('👤 Found parent user:', parentId);
      
      // Try different token locations
      if (typeof parentData.expoPushToken === 'string') {
        expoPushToken = parentData.expoPushToken;
        console.log('✅ Found token (string)');
      } else if (parentData.expoPushToken && parentData.expoPushToken.token) {
        expoPushToken = parentData.expoPushToken.token;
        console.log('✅ Found token (object)');
      } else if (parentData.fcmToken) {
        expoPushToken = parentData.fcmToken;
        console.log('✅ Found fcmToken');
      }
      
      // Fallback to parents table
      if (!expoPushToken) {
        const parentsSnapshot = await db.ref(`parents/${parentId}`).once('value');
        const parentsData = parentsSnapshot.val();
        if (parentsData) {
          expoPushToken = parentsData.expoPushToken || parentsData.fcmToken;
          if (expoPushToken) console.log('✅ Found token in parents table');
        }
      }
    }
    
    if (!expoPushToken) {
      console.log('❌ No push token found for parent');
      return;
    }
    
    console.log('📤 Sending manual attendance notification...');
    
    // Determine notification title based on status
    let title = '✅ Manual Attendance Entry';
    if (entry.status === 'Late') {
      title = '⚠️ Manual Entry - Late Arrival';
    } else if (entry.status === 'Absent') {
      title = '❌ Manual Entry - Marked Absent';
    }
    
    // Send push notification
    const message = {
      to: expoPushToken,
      sound: 'default',
      title: title,
      body: `${entry.studentName} was manually marked ${entry.status} for ${entry.date} at ${entry.time}. Reason: ${entry.reason}`,
      data: {
        type: 'manual_attendance',
        studentRfid: entry.studentRfid,
        studentName: entry.studentName,
        status: entry.status,
        date: entry.date,
        time: entry.time,
        reason: entry.reason,
        enteredBy: entry.enteredBy,
        timestamp: entry.timestamp || Date.now()
      },
      priority: 'high',
      channelId: 'attendance',
      badge: 1,
      ttl: 0
    };
    
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    const result = await response.json();
    
    if (result.data) {
      if (result.data.status === 'ok' || (result.data[0] && result.data[0].status === 'ok')) {
        console.log('✅ Manual attendance notification sent successfully!');
        console.log('📬 Receipt ID:', result.data.id || result.data[0]?.id);
      } else {
        console.log('⚠️ Notification status:', result.data.status || result.data[0]?.status);
      }
    }
    
  } catch (err) {
    console.error('❌ Error sending manual attendance notification:', err);
  }
});

console.log('✅ Manual attendance listener active!');

// Keep the process alive and handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Server shutting down...');
  process.exit();
});
