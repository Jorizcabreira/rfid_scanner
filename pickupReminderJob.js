// pickupReminderJob.js
// Run this script every hour (e.g., via cron or Firebase scheduled function)

const admin = require('firebase-admin');
const db = admin.database();

function getTodayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

async function sendPickupReminder(studentId, parentId) {
  // TODO: Replace with your push notification logic (Expo/Firebase)
  console.log(`Sending pickup reminder to parent ${parentId} for student ${studentId}`);
  // Example: Call your notification service here
}

async function shouldSendPickupReminder(studentId, parentId) {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();

  // Only send between 12:30 PM and 9:00 PM
  if (hour < 12 || (hour === 12 && minute < 30) || hour >= 21) return false;

  // Check if parent has already scanned for pickup today
  const scanRef = db.ref(`pickups/${studentId}/${getTodayDateString()}`);
  const scanSnapshot = await scanRef.once('value');
  if (scanSnapshot.exists()) return false;

  // Get last reminder timestamp
  const reminderRef = db.ref(`pickupReminders/${studentId}/${parentId}`);
  const reminderSnapshot = await reminderRef.once('value');
  const lastReminder = reminderSnapshot.val();

  if (lastReminder) {
    const last = new Date(lastReminder);
    if (
      last.getFullYear() === now.getFullYear() &&
      last.getMonth() === now.getMonth() &&
      last.getDate() === now.getDate() &&
      last.getHours() === now.getHours()
    ) {
      // Already sent a reminder this hour
      return false;
    }
  }

  // Send reminder
  await sendPickupReminder(studentId, parentId);
  await reminderRef.set(now.toISOString());
  return true;
}

async function hourlyPickupReminderJob() {
  const studentsSnapshot = await db.ref('students').once('value');
  const students = studentsSnapshot.val();
  for (const studentId in students) {
    const guardians = students[studentId].guardians || [];
    for (const guardian of guardians) {
      const parentId = guardian.parentUid || guardian.rfid;
      await shouldSendPickupReminder(studentId, parentId);
    }
  }
}

// Run the job
hourlyPickupReminderJob().then(() => {
  console.log('Hourly pickup reminder job completed.');
  process.exit(0);
}).catch(err => {
  console.error('Error running pickup reminder job:', err);
  process.exit(1);
});
