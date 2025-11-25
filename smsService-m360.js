// SMS Service using M360 SMS API
const fetch = require('node-fetch');

// M360 SMS API Configuration
// Register at: https://m360.com.ph/ or https://app.m360.com.ph/
const M360_CONFIG = {
  apiUrl: 'https://api.m360.com.ph/v3/api/broadcast',
  // I-paste mo dito ang API Key from M360 dashboard
  apiKey: 'YOUR_M360_API_KEY_HERE',
  appId: 'YOUR_APP_ID_HERE',
  appSecret: 'YOUR_APP_SECRET_HERE',
};

/**
 * Send SMS using M360 API
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

    // M360 API request
    const response = await fetch(M360_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_key: M360_CONFIG.apiKey,
        app_secret: M360_CONFIG.appSecret,
        msisdn: cleanedNumber,
        content: message,
      }),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      console.log('✅ SMS sent successfully:', result);
      return {
        success: true,
        messageId: result.message_id || result.batch_id,
        data: result,
      };
    } else {
      console.error('❌ SMS sending failed:', result);
      return {
        success: false,
        error: result.message || 'Unknown error',
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
    ? `⚠️ LATE ARRIVAL\n${studentName} entered school LATE at ${timeIn}. Please ensure timely arrival.`
    : `✅ SCHOOL ARRIVAL\n${studentName} entered school ON TIME at ${timeIn}. Have a great day!`;

  return await sendSMS(phoneNumber, message);
}

/**
 * Send pickup reminder via SMS
 */
async function sendPickupReminderSMS(phoneNumber, studentName) {
  const message = `🔔 PICKUP REMINDER\nDon't forget to scan your RFID when picking up ${studentName}. Thank you!`;
  return await sendSMS(phoneNumber, message);
}

/**
 * Send pickup confirmation via SMS
 */
async function sendPickupConfirmationSMS(phoneNumber, studentName, pickupTime, guardianName) {
  const message = `✅ PICKUP CONFIRMED\n${studentName} was picked up by ${guardianName} at ${pickupTime}. Safe trip home!`;
  return await sendSMS(phoneNumber, message);
}

/**
 * Send manual pickup pending SMS
 */
async function sendManualPickupPendingSMS(phoneNumber, studentName) {
  const message = `⏳ PICKUP PENDING\nManual pickup for ${studentName} is waiting for admin approval. Please wait for confirmation.`;
  return await sendSMS(phoneNumber, message);
}

/**
 * Send OTP via SMS
 */
async function sendOTPSMS(phoneNumber, otp) {
  const message = `Your verification code is: ${otp}\n\nThis code will expire in 5 minutes. Do not share this code with anyone.`;
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
