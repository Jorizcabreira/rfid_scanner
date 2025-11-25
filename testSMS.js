// Test SMS Service
const { 
  sendSMS, 
  sendAttendanceSMS,
  sendPickupReminderSMS,
  sendOTPSMS,
  cleanPhoneNumber 
} = require('./smsService');

console.log('📱 SMS Service Test\n');

// Test 1: Clean phone number function
console.log('Test 1: Phone Number Cleaning');
console.log('09123456789 →', cleanPhoneNumber('09123456789'));
console.log('+639123456789 →', cleanPhoneNumber('+639123456789'));
console.log('9123456789 →', cleanPhoneNumber('9123456789'));
console.log('0912-345-6789 →', cleanPhoneNumber('0912-345-6789'));
console.log('');

// Test 2: Basic SMS (CHANGE THIS TO YOUR PHONE NUMBER)
async function testBasicSMS() {
  console.log('Test 2: Basic SMS');
  const result = await sendSMS(
    '09123456789', // ⚠️ PALITAN MO ITO SA IYONG PHONE NUMBER
    'Hello! This is a test message from RFID Scanner System. If you receive this, SMS is working! 🎉'
  );
  console.log('Result:', result);
  console.log('');
}

// Test 3: Attendance SMS
async function testAttendanceSMS() {
  console.log('Test 3: Attendance SMS');
  
  // Test ON TIME notification
  const onTimeResult = await sendAttendanceSMS(
    '09123456789', // ⚠️ PALITAN MO ITO
    'Juan Dela Cruz',
    'On Time',
    '7:30 AM'
  );
  console.log('On Time Result:', onTimeResult);
  
  // Wait 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test LATE notification
  const lateResult = await sendAttendanceSMS(
    '09123456789', // ⚠️ PALITAN MO ITO
    'Juan Dela Cruz',
    'Late',
    '8:15 AM'
  );
  console.log('Late Result:', lateResult);
  console.log('');
}

// Test 4: Pickup Reminder SMS
async function testPickupReminderSMS() {
  console.log('Test 4: Pickup Reminder SMS');
  const result = await sendPickupReminderSMS(
    '09123456789', // ⚠️ PALITAN MO ITO
    'Juan Dela Cruz'
  );
  console.log('Result:', result);
  console.log('');
}

// Test 5: OTP SMS
async function testOTPSMS() {
  console.log('Test 5: OTP SMS');
  const result = await sendOTPSMS(
    '09123456789', // ⚠️ PALITAN MO ITO
    '123456'
  );
  console.log('Result:', result);
  console.log('');
}

// Run all tests
async function runAllTests() {
  console.log('⚠️  IMPORTANT: Baguhin mo muna ang phone number sa code!');
  console.log('⚠️  At i-configure muna ang API key sa smsService.js\n');
  
  // Uncomment the tests you want to run:
  
  // await testBasicSMS();
  // await testAttendanceSMS();
  // await testPickupReminderSMS();
  // await testOTPSMS();
  
  console.log('✅ Tests completed!');
}

// Instruction
console.log('📝 Para mag-test:');
console.log('1. Baguhin ang API key sa smsService.js');
console.log('2. Baguhin ang phone number sa test cases (09123456789)');
console.log('3. Uncomment yung test na gusto mo i-run');
console.log('4. Run: node testSMS.js\n');

// Run tests
runAllTests().catch(console.error);
