// pickupReminderJob.js
// Run this script every hour (e.g., via cron or Firebase scheduled function)

const admin = require('firebase-admin');
const db = admin.database();

function getTodayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

const { sendPushNotification } = require('./sendNotifications');

async function sendPickupReminder(studentId, parentId, studentFullName) {
  // Use sendPushNotification to send pickup reminder
  await sendPushNotification(
    '🔔 Pickup Reminder',
    `Don\'t forget to scan your RFID when picking up ${studentFullName}`,
    {
      type: 'pickup_reminder',
      studentId,
      studentName: studentFullName,
      action: 'pickup_reminder',
      timestamp: Date.now()
    },
    true // URGENT
  );
}

async function shouldSendPickupReminder(studentId, parentId, studentFullName) {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // Only send at exactly 12:30 PM
  if (!(hour === 12 && minute === 30)) return false;

  // Check if parent has already scanned for pickup today
  const scanRef = db.ref(`pickups/${studentId}/${getTodayDateString()}`);
  const scanSnapshot = await scanRef.once('value');
  if (scanSnapshot.exists()) return false;

  // Deduplication: Only send one reminder per student per day
  const studentReminderRef = db.ref(`pickupReminders/${studentId}/sentDate`);
  const studentReminderSnapshot = await studentReminderRef.once('value');
  const lastSentDate = studentReminderSnapshot.val();
  const todayDate = getTodayDateString();
  if (lastSentDate === todayDate) {
    // Already sent a reminder for this student today
    return false;
  }

  // Send reminder
  await sendPickupReminder(studentId, parentId, studentFullName);
  await studentReminderRef.set(todayDate);
  return true;
}

async function pickupReminderJob() {
  const studentsSnapshot = await db.ref('students').once('value');
  const students = studentsSnapshot.val();
  for (const studentId in students) {
    const student = students[studentId];
    const studentFullName = student.fullName || `${student.firstName || ''} ${student.lastName || ''}`.trim();
    const guardians = student.guardians || [];
    let sent = false;
    for (const guardian of guardians) {
      if (sent) break; // Only send once per student
      const parentId = guardian.parentUid || guardian.rfid;
      sent = await shouldSendPickupReminder(studentId, parentId, studentFullName);
    }
  }
}

// Run the job
pickupReminderJob().then(() => {
  // ...existing code...
  process.exit(0);
}).catch(err => {
  console.error('Error running pickup reminder job:', err);
  process.exit(1);
});
