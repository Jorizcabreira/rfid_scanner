# 🚀 SEMAPHORE SMS QUICK SETUP (100 FREE SMS!)

## Why Semaphore? 
- ✅ 100 FREE SMS credits upon registration
- ✅ Easy setup (5 minutes)
- ✅ Philippine-based
- ✅ Reliable API
- ✅ Good documentation

## 📝 STEP-BY-STEP SETUP

### Step 1: Register (2 minutes)

1. **Go to:** https://semaphore.co/signup

2. **Fill up form:**
   ```
   Full Name: [Your Name]
   Email: [your.email@gmail.com]
   Mobile: [09XXXXXXXXX]
   Password: [Create strong password]
   ```

3. **Click "Create Account"**

4. **Verify email** - Check inbox and click verification link

5. **Verify mobile** - Enter OTP sent to your phone

✅ **You now have 100 FREE SMS credits!**

---

### Step 2: Get API Key (1 minute)

1. **Login** to Semaphore dashboard

2. **Go to:** Settings > API > API Keys

3. **Copy your API Key** 
   - Format: `abc123def456ghi789jkl012mno345pq`

---

### Step 3: Configure Project (2 minutes)

**Option A: Use Semaphore (Recommended)**

1. Rename/backup old smsService.js:
   ```bash
   mv smsService.js smsService-iprog.js
   ```

2. Use Semaphore version:
   ```bash
   mv smsService-semaphore.js smsService.js
   ```

3. Edit `smsService.js`:
   ```javascript
   const SEMAPHORE_CONFIG = {
     apiUrl: 'https://api.semaphore.co/api/v4/messages',
     apiKey: 'abc123def456ghi789jkl012mno345pq', // ← PASTE YOUR API KEY HERE
     senderId: 'SEMAPHORE',
   };
   ```

**Option B: Keep iProg (if you prefer)**

Just edit `smsService.js` and update:
```javascript
const IPROG_SMS_CONFIG = {
  apiUrl: 'https://api.iprog.com/v1/sms/send',
  apiKey: 'YOUR_IPROG_API_KEY', // ← Paste iProg API key
  senderId: '09XXXXXXXXX',
};
```

---

### Step 4: Test (1 minute)

1. **Edit testSMS.js** - Change phone number:
   ```javascript
   '09123456789' // ← Change to your actual number
   ```

2. **Run test:**
   ```bash
   node testSMS.js
   ```

3. **Check your phone** - You should receive test SMS! 📱

---

## 💰 Pricing After Free Credits

| SMS Type | Cost per SMS |
|----------|--------------|
| Regular SMS (160 chars) | ₱0.50 |
| Priority SMS | ₱0.80 |
| OTP SMS | ₱1.00 |

**Load Options:**
- ₱100 = 200 SMS
- ₱500 = 1,000 SMS  
- ₱1,000 = 2,000 SMS
- ₱5,000 = 10,000 SMS (₱0.50 each)

---

## 🎯 Quick Integration Examples

### 1. Send Attendance SMS
```javascript
const { sendAttendanceSMS } = require('./smsService');

await sendAttendanceSMS(
  '09123456789',
  'Juan Dela Cruz',
  'On Time',
  '7:30 AM'
);
```

### 2. Send Pickup Reminder
```javascript
const { sendPickupReminderSMS } = require('./smsService');

await sendPickupReminderSMS(
  '09123456789',
  'Juan Dela Cruz'
);
```

### 3. Send OTP
```javascript
const { sendOTPSMS } = require('./smsService');

await sendOTPSMS(
  '09123456789',
  '123456'
);
```

### 4. Check Credits Balance
```javascript
const { checkBalance } = require('./smsService');

const result = await checkBalance();
console.log('Remaining credits:', result.balance);
```

---

## 🔧 Integration sa Server

### Add SMS sa Attendance Notification

Edit your attendance monitoring code:

```javascript
const { sendAttendanceSMS } = require('./smsService');
const { ref, update } = require('firebase/database');

// When student scans RFID
async function recordAttendance(rfid, studentData) {
  // Save to database
  await update(ref(database, `attendance/${rfid}`), {
    timeIn: new Date().toISOString(),
    status: isLate ? 'Late' : 'On Time',
  });

  // Send SMS to parent
  if (studentData.parentPhone) {
    await sendAttendanceSMS(
      studentData.parentPhone,
      studentData.name,
      isLate ? 'Late' : 'On Time',
      formatTime(new Date())
    );
  }
}
```

---

## 📱 Update Database Structure

Add phone numbers to Firebase:

```javascript
// Firebase: users/{uid}
{
  email: "parent@example.com",
  phone: "09123456789",  // ← ADD THIS FIELD
  name: "Parent Name",
  photoBase64: "...",
  // ...
}
```

---

## ✅ Testing Checklist

- [ ] Semaphore account created
- [ ] API key copied
- [ ] smsService.js configured
- [ ] Test SMS sent successfully
- [ ] Phone number saved in database
- [ ] Attendance SMS working
- [ ] Pickup reminder SMS working
- [ ] OTP SMS working (if needed)
- [ ] Credits balance checked

---

## 🆘 Troubleshooting

### "Invalid API Key"
- Check if API key is correct
- No spaces before/after the key
- Regenerate API key if needed

### "Invalid Phone Number"
- Use format: 09XXXXXXXXX (11 digits)
- No spaces, dashes, or special chars

### SMS not received
- Check phone number is active
- Check network signal
- Check spam/blocked messages
- Wait 1-2 minutes (may delay)

### Low credits warning
- Load more credits in dashboard
- Check current balance: `node testSMS.js` (run checkBalance)

---

## 📞 Support

**Semaphore Support:**
- Website: https://semaphore.co
- Email: hello@semaphore.co
- Docs: https://semaphore.co/docs

**Common Issues:**
- API Status: https://status.semaphore.co
- FAQs: https://semaphore.co/faqs

---

## 🎉 YOU'RE READY!

Kapag na-setup mo na:
1. Test using `node testSMS.js`
2. Integrate sa iyong attendance system
3. Add phone field sa signup form
4. Start sending SMS notifications!

**Enjoy your 100 FREE SMS credits! 🎊**
