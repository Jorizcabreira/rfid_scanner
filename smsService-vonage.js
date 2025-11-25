// SMS Service using Vonage (Nexmo) SMS API
const fetch = require('node-fetch');

// VONAGE SMS API Configuration
// Register at: https://dashboard.nexmo.com/sign-up
// Free trial credits available!
const VONAGE_CONFIG = {
  apiUrl: 'https://rest.nexmo.com/sms/json',
  // I-paste mo dito ang credentials from Vonage dashboard
  apiKey: 'YOUR_VONAGE_API_KEY',
  apiSecret: 'YOUR_VONAGE_API_SECRET',
  from: 'YourSchool', // Sender name (up to 11 characters)
};

/**
 * Send SMS using Vonage API
 * @param {string} phoneNumber - Recipient phone number (09xxxxxxxxx format)
 * @param {string} message - SMS message content
 * @returns {Promise<Object>} - API response
 */
async function sendSMS(phoneNumber, message) {
  try {
    console.log(`📱 Sending SMS to ${phoneNumber}...`);

    // Validate phone number format
    const cleanedNumber = cleanPhoneNumber(phoneNumber);
    if (!cleanedNumber) {
      throw new Error('Invalid phone number format');
    }

    // Convert to international format for Vonage
    const internationalNumber = cleanedNumber.replace(/^0/, '63');

    // Vonage API request
    const response = await fetch(VONAGE_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: VONAGE_CONFIG.apiKey,
        api_secret: VONAGE_CONFIG.apiSecret,
        to: internationalNumber,
        from: VONAGE_CONFIG.from,
        text: message,
      }),
    });

    const result = await response.json();

    if (result.messages && result.messages[0].status === '0') {
      console.log('✅ SMS sent successfully:', result.messages[0]);
      return {
        success: true,
        messageId: result.messages[0]['message-id'],
        data: result.messages[0],
      };
    } else {
      const errorMsg = result.messages[0]['error-text'] || 'Unknown error';
      console.error('❌ SMS sending failed:', errorMsg);
      return {
        success: false,
        error: errorMsg,
        data: result,
      };
    }
  } catch (error) {
    console.error('❌ SMS error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Clean and validate Philippine phone number
 * Accepts: 09xxxxxxxxx, +639xxxxxxxxx, 9xxxxxxxxx
 * Returns: 09xxxxxxxxx format
 */
function cleanPhoneNumber(phoneNumber) {
  if (!phoneNumber) return null;

  // Remove all non-digit characters
  let cleaned = phoneNumber.replace(/\D/g, '');

  // Convert +63 format to 0 format
  if (cleaned.startsWith('63')) {
    cleaned = '0' + cleaned.substring(2);
  }

  // Add leading 0 if missing
  if (cleaned.startsWith('9') && cleaned.length === 10) {
    cleaned = '0' + cleaned;
  }

  // Validate format: must be 11 digits starting with 09
  if (cleaned.length === 11 && cleaned.startsWith('09')) {
    return cleaned;
  }

  return null;
}

/**
 * Send attendance notification via SMS
 */
async function sendAttendanceSMS(phoneNumber, studentName, status, timeIn) {
  const message = status === 'Late'
    ? `LATE ARRIVAL: ${studentName} entered school LATE at ${timeIn}. Please ensure timely arrival.`
    : `SCHOOL ARRIVAL: ${studentName} entered school ON TIME at ${timeIn}. Have a great day!`;

  return await sendSMS(phoneNumber, message);
}

/**
 * Send pickup reminder via SMS
 */
async function sendPickupReminderSMS(phoneNumber, studentName) {
  const message = `PICKUP REMINDER: Don't forget to scan your RFID when picking up ${studentName}. Thank you!`;
  return await sendSMS(phoneNumber, message);
}

/**
 * Send pickup confirmation via SMS
 */
async function sendPickupConfirmationSMS(phoneNumber, studentName, pickupTime, guardianName) {
  const message = `PICKUP CONFIRMED: ${studentName} was picked up by ${guardianName} at ${pickupTime}. Safe trip home!`;
  return await sendSMS(phoneNumber, message);
}

/**
 * Send manual pickup pending SMS
 */
async function sendManualPickupPendingSMS(phoneNumber, studentName) {
  const message = `PICKUP PENDING: Manual pickup for ${studentName} is waiting for admin approval. Please wait for confirmation.`;
  return await sendSMS(phoneNumber, message);
}

/**
 * Send OTP via SMS
 */
async function sendOTPSMS(phoneNumber, otp) {
  const message = `Your verification code is: ${otp}. This code will expire in 5 minutes. Do not share this code with anyone.`;
  return await sendSMS(phoneNumber, message);
}

/**
 * Send bulk SMS to multiple recipients
 */
async function sendBulkSMS(phoneNumbers, message) {
  console.log(`📱 Sending bulk SMS to ${phoneNumbers.length} recipients...`);
  
  const results = [];
  for (const phoneNumber of phoneNumbers) {
    const result = await sendSMS(phoneNumber, message);
    results.push({
      phoneNumber,
      ...result,
    });
    
    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`✅ Sent ${successCount}/${phoneNumbers.length} SMS successfully`);

  return {
    total: phoneNumbers.length,
    successful: successCount,
    failed: phoneNumbers.length - successCount,
    results,
  };
}

module.exports = {
  sendSMS,
  sendAttendanceSMS,
  sendPickupReminderSMS,
  sendPickupConfirmationSMS,
  sendManualPickupPendingSMS,
  sendOTPSMS,
  sendBulkSMS,
  cleanPhoneNumber,
};
