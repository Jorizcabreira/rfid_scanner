// sendTeacherMessageNotifications.js
// Monitors teacher messages and sends push notifications to parents

const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Initialize Firebase Admin if not already initialized
try {
  if (!admin.apps.length) {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: 'https://rfidattendance-595f4-default-rtdb.firebaseio.com'
    });
  }
} catch (error) {
  console.log('Firebase already initialized or error:', error.message);
}

const db = admin.database();

// Expo Push API endpoint
const EXPO_PUSH_API = 'https://exp.host/--/api/v2/push/send';

/**
 * Send push notification via Expo Push Notification Service
 */
async function sendExpoPushNotification(pushToken, title, body, data = {}) {
  try {
    console.log(`📤 Sending push notification to token: ${pushToken.substring(0, 20)}...`);
    
    const message = {
      to: pushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data,
      priority: 'high',
      channelId: 'default',
    };

    const response = await fetch(EXPO_PUSH_API, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('📨 Expo API Response:', JSON.stringify(result).substring(0, 200));
    
    if (result.data && result.data[0]) {
      const ticketData = result.data[0];
      if (ticketData.status === 'ok') {
        console.log('✅ Push notification sent successfully:', ticketData.id);
        return { success: true, ticketId: ticketData.id };
      } else if (ticketData.status === 'error') {
        console.error('❌ Push notification error:', ticketData.message);
        return { success: false, error: ticketData.message };
      }
    }
    
    // Check for direct success response (some Expo responses are structured differently)
    if (response.ok || response.status === 200) {
      console.log('✅ Push notification sent (alternative response format)');
      return { success: true, ticketId: null };
    }

    console.log('⚠️ Unexpected push notification response:', result);
    return { success: true, ticketId: null };
  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get parent's push token from student ID
 */
async function getParentPushToken(studentId) {
  try {
    console.log(`🔍 Looking for parent of student: ${studentId}`);
    
    // Get student data
    const studentSnapshot = await db.ref(`students/${studentId}`).once('value');
    const studentData = studentSnapshot.val();
    
    if (!studentData) {
      console.log('❌ No student data found for:', studentId);
      return null;
    }

    console.log(`✅ Found student: ${studentData.firstName} ${studentData.lastName}`);
    
    // Get parent RFID from guardians array
    let parentRfid = null;
    if (studentData.guardians && Array.isArray(studentData.guardians)) {
      // Try to find first guardian with email
      const guardianWithEmail = studentData.guardians.find(g => g.email || g.Email);
      if (guardianWithEmail) {
        parentRfid = guardianWithEmail.rfid || guardianWithEmail.parentUid || guardianWithEmail.parentRfid;
      }
    }
    
    // Fallback to rfid field if exists
    if (!parentRfid && studentData.rfid) {
      parentRfid = studentData.rfid;
    }

    if (!parentRfid) {
      console.log('❌ No parent RFID found in student data');
      return null;
    }

    console.log(`🔍 Looking for parent with RFID: ${parentRfid}`);

    // Search for parent user with matching guardianRfid
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();

    for (const userId in users) {
      const user = users[userId];
      
      // Check if this user is a parent with matching RFID
      if (user.role === 'parent' && user.guardianRfid === parentRfid) {
        console.log(`✅ Found parent: ${user.email} (UID: ${userId})`);
        
        // Check if parent has push token in any location
        let pushToken = null;
        if (user.pushToken && user.pushToken.token) {
          pushToken = user.pushToken.token;
        } else if (user.expoPushToken && user.expoPushToken.token) {
          pushToken = user.expoPushToken.token;
        } else if (typeof user.pushToken === 'string') {
          pushToken = user.pushToken;
        } else if (typeof user.expoPushToken === 'string') {
          pushToken = user.expoPushToken;
        }
        
        if (pushToken) {
          console.log(`✅ Parent has push token: ${pushToken.substring(0, 20)}...`);
          return {
            token: pushToken,
            parentName: `${user.firstname || ''} ${user.lastname || ''}`.trim(),
            parentEmail: user.email,
            studentName: `${studentData.firstName || ''} ${studentData.lastName || ''}`.trim(),
            studentRfid: parentRfid
          };
        } else {
          console.log('⚠️ Parent found but no push token registered');
          console.log('   Please make sure parent has opened the app and granted notification permissions');
          return null;
        }
      }
    }

    console.log('❌ No parent user found with guardianRfid:', parentRfid);
    return null;
  } catch (error) {
    console.error('Error getting parent push token:', error);
    return null;
  }
}

/**
 * Send notification to parent about teacher message
 */
async function notifyParentAboutMessage(studentId, teacherName, messageText, messageType = 'text') {
  try {
    console.log(`\n🔔 Processing notification for student: ${studentId}`);
    
    const parentData = await getParentPushToken(studentId);
    
    if (!parentData || !parentData.token) {
      console.log('❌ Cannot send notification - no parent token found');
      return { success: false, reason: 'No parent token' };
    }

    // Prepare notification
    const title = `📧 Message from ${teacherName}`;
    let body = '';
    
    if (messageType === 'image') {
      body = `${teacherName} sent you an image`;
    } else if (messageType === 'file') {
      body = `${teacherName} sent you a file`;
    } else {
      // Truncate message if too long
      body = messageText.length > 100 
        ? messageText.substring(0, 97) + '...' 
        : messageText;
    }

    const notificationData = {
      type: 'teacher_message',
      studentId: studentId,
      studentName: parentData.studentName,
      teacherName: teacherName,
      messagePreview: messageText.substring(0, 100),
      timestamp: Date.now(),
      screen: 'message'
    };

    // Send push notification
    const result = await sendExpoPushNotification(
      parentData.token,
      title,
      body,
      notificationData
    );

    if (result.success) {
      console.log(`✅ Notification sent to ${parentData.parentName} (${parentData.parentEmail})`);
      
      // Save notification to Firebase for tracking
      if (parentData.studentRfid) {
        const notificationRecord = {
          type: 'teacher_message',
          studentId: studentId,
          studentName: parentData.studentName,
          teacherName: teacherName,
          message: messageText,
          messageType: messageType,
          timestamp: Date.now(),
          read: false,
          notificationSent: true
        };
        
        // Only add pushTicketId if it exists
        if (result.ticketId) {
          notificationRecord.pushTicketId = result.ticketId;
        }
        
        await db.ref(`parentNotifications/${parentData.studentRfid}`).push(notificationRecord);
      }

      return { success: true, parentName: parentData.parentName };
    } else {
      console.log('❌ Failed to send notification:', result.error);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error('❌ Error notifying parent:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Start monitoring teacher messages
 */
function startMonitoringMessages() {
  console.log('🚀 Starting teacher message notification monitor...');
  console.log('📡 Listening for new teacher messages...\n');

  // Monitor all student message nodes
  db.ref('messages').on('child_added', async (studentSnapshot) => {
    const studentId = studentSnapshot.key;
    
    // Listen for new messages for this student
    db.ref(`messages/${studentId}`).on('child_added', async (messageSnapshot) => {
      const message = messageSnapshot.val();
      
      // Only process teacher messages that haven't been notified
      if (message && message.sender === 'teacher' && !message.notificationSent) {
        console.log(`\n📨 New teacher message detected for student: ${studentId}`);
        console.log(`Message: ${message.text?.substring(0, 50)}...`);
        
        // Send notification
        const result = await notifyParentAboutMessage(
          studentId,
          message.senderName || 'Teacher',
          message.text || 'New message from teacher',
          message.type || 'text'
        );

        // Mark message as notified
        if (result.success) {
          await db.ref(`messages/${studentId}/${messageSnapshot.key}`).update({
            notificationSent: true,
            notificationTimestamp: Date.now()
          });
          console.log(`✅ Message marked as notified`);
        }
      }
    });
  });

  console.log('✅ Monitor started successfully!');
  console.log('Waiting for new messages...\n');
}

/**
 * Test notification function
 */
async function testNotification(studentId, testMessage = 'This is a test notification from teacher!') {
  console.log(`\n🧪 Testing notification for student: ${studentId}`);
  
  const result = await notifyParentAboutMessage(
    studentId,
    'Test Teacher',
    testMessage,
    'text'
  );

  if (result.success) {
    console.log(`\n✅ Test notification sent successfully to ${result.parentName}`);
  } else {
    console.log(`\n❌ Test notification failed: ${result.error || result.reason}`);
  }

  return result;
}

// Start the monitor if running directly
if (require.main === module) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  TEACHER MESSAGE NOTIFICATION SERVICE');
  console.log('═══════════════════════════════════════════════════════\n');
  
  startMonitoringMessages();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down notification service...');
    process.exit(0);
  });
}

module.exports = {
  sendExpoPushNotification,
  getParentPushToken,
  notifyParentAboutMessage,
  startMonitoringMessages,
  testNotification
};
