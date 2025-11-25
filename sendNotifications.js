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