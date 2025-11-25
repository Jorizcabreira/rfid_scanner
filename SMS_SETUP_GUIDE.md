# iProg SMS Setup Guide

## Paano Gamitin ang iProg SMS API (Free)

### Step 1: Register sa iProg SMS

1. **Pumunta sa iProg SMS website:**
   - Visit: https://www.iprog.com/ (o alternative SMS providers)
   - Alternative free SMS APIs:
     - Semaphore: https://semaphore.co/
     - Twilio (may free trial): https://www.twilio.com/
     - M360: https://m360.com.ph/

2. **Create Account:**
   - Click "Sign Up" o "Register"
   - Fill up registration form
   - Verify email address
   - Complete account setup

3. **Get API Credentials:**
   - Login to dashboard
   - Go to API Settings / Developer Section
   - Copy your **API Key**
   - Note your **Sender ID** (usually your registered mobile number)

### Step 2: Configure SMS Service

1. **Edit `smsService.js` file:**
   ```javascript
   const IPROG_SMS_CONFIG = {
     apiUrl: 'https://api.iprog.com/v1/sms/send',
     apiKey: 'YOUR_ACTUAL_API_KEY_HERE', // Paste your API key
     senderId: '09XXXXXXXXX', // Your registered mobile number
   };
   ```

2. **Install required packages (if not yet installed):**
   ```bash
   npm install node-fetch
   ```

### Step 3: Test SMS Sending

Create a test file `testSMS.js`:

```javascript
const { sendSMS, sendOTPSMS } = require('./smsService');

// Test basic SMS
async function testBasicSMS() {
  const result = await sendSMS(
    '09123456789', // Replace with your phone number
    'Hello! This is a test message from RFID Scanner System.'
  );
  console.log('Test result:', result);
}

// Test OTP SMS
async function testOTP() {
  const result = await sendOTPSMS(
    '09123456789', // Replace with your phone number
    '123456'
  );
  console.log('OTP result:', result);
}

// Run tests
testBasicSMS();
// testOTP();
```

Run test:
```bash
node testSMS.js
```

### Step 4: Integrate sa Existing System

#### Option 1: Mag-send ng SMS kasama ng Push Notification

Edit `sendNotifications.js`:

```javascript
const { sendPushNotification } = require('./service/pushNotificationService');
const { sendAttendanceSMS, sendPickupReminderSMS } = require('./smsService');

// Example: Attendance notification
async function notifyAttendance(parentPhone, studentName, status, timeIn) {
  // Send push notification
  await sendPushNotification(
    status === 'Late' ? '⚠️ Late Arrival' : '✅ School Arrival',
    `${studentName} entered school ${status === 'Late' ? 'LATE' : 'ON TIME'} at ${timeIn}`,
    { type: 'attendance_update' }
  );

  // Send SMS
  if (parentPhone) {
    await sendAttendanceSMS(parentPhone, studentName, status, timeIn);
  }
}
```

#### Option 2: Add SMS sa OTP System

Edit `otpServer.js`:

```javascript
const { sendOTPSMS } = require('./smsService');

app.post('/api/send-otp', async (req, res) => {
  const { email, phone } = req.body;
  
  const otp = generateOTP();
  
  // Send via email (existing)
  await sendOTPEmail(email, otp);
  
  // Send via SMS (new)
  if (phone) {
    await sendOTPSMS(phone, otp);
  }
  
  res.json({ success: true });
});
```

### Step 5: Update Firebase Database Structure

Add phone number field sa users:

```javascript
// Firebase structure
users/
  uid/
    email: "parent@example.com"
    phone: "09123456789"  // <-- ADD THIS
    name: "Parent Name"
    photoBase64: "..."
```

### Step 6: Update Signup Form

Edit `app/signup.tsx` to include phone number:

```typescript
const [phone, setPhone] = useState('');

// Add input field
<TextInput
  placeholder="Phone Number (09XXXXXXXXX)"
  value={phone}
  onChangeText={setPhone}
  keyboardType="phone-pad"
  maxLength={11}
/>

// Save to Firebase
await set(ref(database, `users/${user.uid}`), {
  email: email,
  phone: phone, // Save phone number
  name: fullName,
  // ...
});
```

## SMS Message Format Examples

### 1. Attendance Notification
```
✅ SCHOOL ARRIVAL
Juan Dela Cruz entered school ON TIME at 7:30 AM. Have a great day!
```

### 2. Late Arrival
```
⚠️ LATE ARRIVAL
Juan Dela Cruz entered school LATE at 8:15 AM. Please ensure timely arrival.
```

### 3. Pickup Reminder
```
🔔 PICKUP REMINDER
Don't forget to scan your RFID when picking up Juan Dela Cruz. Thank you!
```

### 4. Pickup Confirmation
```
✅ PICKUP CONFIRMED
Juan Dela Cruz was picked up by Maria Dela Cruz at 5:00 PM. Safe trip home!
```

### 5. OTP Verification
```
Your verification code is: 123456

This code will expire in 5 minutes. Do not share this code with anyone.
```

## Cost Estimation (Example rates)

| Provider | Free Credits | Cost per SMS |
|----------|--------------|--------------|
| Semaphore | 100 free SMS | ₱0.50 - ₱1.00 |
| iProg | Varies | ₱0.40 - ₱0.80 |
| M360 | Trial credits | ₱0.45 - ₱0.85 |
| Twilio | $15 trial | $0.02 - $0.04 (USD) |

## Important Notes

1. **Rate Limiting:**
   - Add delays between bulk SMS (1 second recommended)
   - Check your provider's rate limits

2. **Message Length:**
   - 1 SMS = 160 characters (English)
   - 1 SMS = 70 characters (with special chars)
   - Longer messages = multiple SMS = higher cost

3. **Phone Number Format:**
   - Always use: 09XXXXXXXXX (11 digits)
   - Service auto-converts +63 format

4. **Error Handling:**
   - Check if phone number exists before sending
   - Handle API errors gracefully
   - Log all SMS attempts

5. **Testing:**
   - Use your own number for testing first
   - Test all notification types
   - Monitor API usage dashboard

## Troubleshooting

### Problem: SMS not sending
**Solutions:**
- Check API key is correct
- Verify phone number format
- Check internet connection
- Verify sender ID is registered
- Check SMS credits balance

### Problem: Invalid sender ID
**Solutions:**
- Register sender ID with provider
- Use registered mobile number
- Wait for sender ID approval (24-48 hours)

### Problem: Message not received
**Solutions:**
- Check if number is active
- Verify network signal
- Check spam/blocked messages
- Contact SMS provider support

## Next Steps

1. ✅ Create iProg account
2. ✅ Get API credentials
3. ✅ Configure smsService.js
4. ✅ Test SMS sending
5. ✅ Add phone field to signup
6. ✅ Integrate with notifications
7. ✅ Monitor usage and costs

## Support

- iProg Support: support@iprog.com
- Semaphore Support: https://semaphore.co/support
- Twilio Docs: https://www.twilio.com/docs

---

**Important:** Always keep your API keys secure and never commit them to public repositories!
