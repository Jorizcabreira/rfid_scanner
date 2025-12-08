const fetch = require('node-fetch');
const admin = require('firebase-admin');

/**
 * Send a push notification to a parent using Expo Push API
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Custom data payload
 * @param {boolean} urgent - If true, set priority to high
 * @param {string} parentUid - Parent UID (to look up push token)
 */
async function sendPushNotification(title, body, data, urgent, parentUid) {
  // Get parent push token from Firebase
  const tokenRef = admin.database().ref(`users/${parentUid}/pushToken/token`);
  const tokenSnapshot = await tokenRef.once('value');
  const expoPushToken = tokenSnapshot.val();

  if (!expoPushToken) {
    return;
  }

  // Send notification via Expo Push API
  const message = {
    to: expoPushToken,
    title,
    body,
    data,
    priority: urgent ? 'high' : 'default',
    sound: 'default',
  };

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    const result = await response.json();
    // ...existing code...
  } catch (error) {
    // ...existing code...
  }
}

// Sa attendance updates:
await sendPushNotification(
  newData.status === 'Late' ? '⚠️ Late Arrival' : '✅ School Arrival',
  `${studentFullName} entered school ${newData.status === 'Late' ? 'LATE' : 'ON TIME'} at ${formatTime(newData.timeIn)}`,
  {
    type: 'attendance_update',
    studentId: student.id,
    studentName: studentFullName,
    status: newData.status,
    time: newData.timeIn,
    timestamp: Date.now()
  },
  newData.status === 'Late' // Mark as urgent if late
);

// Sa pickup reminders:
await sendPushNotification(
  '🔔 Pickup Reminder',
  `Don't forget to scan your RFID when picking up ${studentFullName}`,
  {
    type: 'reminder',
    studentId: student.id,
    studentName: studentFullName,
    action: 'pickup_reminder',
    timestamp: Date.now()
  },
  true // URGENT - needs attention
);

// Sa manual pickup:
await sendPushNotification(
  '⏳ Pickup Pending Verification',
  `Manual pickup for ${studentFullName} is waiting for admin approval`,
  {
    type: 'pickup_update',
    studentId: student.id,
    studentName: studentFullName,
    status: 'pending_verification',
    timestamp: Date.now()
  }
);