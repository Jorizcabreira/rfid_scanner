# 🚀 ALTERNATIVE SMS PROVIDERS SETUP

Since Semaphore is not available, here are guaranteed working alternatives:

---

## 🌟 OPTION 1: VONAGE (NEXMO) - RECOMMENDED!

### Why Vonage?
- ✅ **FREE €2 trial credits** (around ₱120 = ~150 SMS)
- ✅ **International company** - reliable global service
- ✅ **Works anywhere** - no geo-restrictions
- ✅ **Easy setup** - 5 minutes
- ✅ **Great documentation**

### Setup Steps:

#### 1. Register (3 minutes)
- **Website:** https://dashboard.nexmo.com/sign-up
- Fill up registration form
- Verify email
- Add phone number
- Get **FREE €2 credits!**

#### 2. Get API Credentials (2 minutes)
1. Login to dashboard
2. Go to: **Getting Started** page
3. Copy:
   - **API Key:** (example: `a1b2c3d4`)
   - **API Secret:** (example: `AbCdEfGhIjKlMnOp`)

#### 3. Configure (1 minute)
```bash
# Rename files
mv smsService.js smsService-backup.js
mv smsService-vonage.js smsService.js
```

Edit `smsService.js`:
```javascript
const VONAGE_CONFIG = {
  apiUrl: 'https://rest.nexmo.com/sms/json',
  apiKey: 'a1b2c3d4',              // ← Paste your API Key
  apiSecret: 'AbCdEfGhIjKlMnOp',   // ← Paste your API Secret
  from: 'YourSchool',               // ← Your sender name (11 chars max)
};
```

#### 4. Test
```bash
node testSMS.js
```

### Pricing After Free Credits:
- Philippines: €0.04 per SMS (~₱2.50)
- Load: €10 = 250 SMS (~₱625)

---

## 🇵🇭 OPTION 2: M360 (Philippine SMS Provider)

### Why M360?
- ✅ **Philippine-based** - local support
- ✅ **Affordable** - ₱0.40-0.60 per SMS
- ✅ **Reliable** - used by many PH companies
- ✅ **Trial credits** available

### Setup Steps:

#### 1. Register
- **Website:** https://www.m360.com.ph/
- Click "Sign Up" or "Get Started"
- Fill up business registration form
- Contact sales for account activation

#### 2. Get API Credentials
After account approval:
- Login to dashboard
- Go to API Settings
- Get:
  - **API Key**
  - **App ID**
  - **App Secret**

#### 3. Configure
```bash
mv smsService.js smsService-backup.js
mv smsService-m360.js smsService.js
```

Edit `smsService.js`:
```javascript
const M360_CONFIG = {
  apiUrl: 'https://api.m360.com.ph/v3/api/broadcast',
  apiKey: 'YOUR_M360_API_KEY',
  appId: 'YOUR_APP_ID',
  appSecret: 'YOUR_APP_SECRET',
};
```

### Pricing:
- Regular: ₱0.40-0.60 per SMS
- OTP: ₱1.00 per SMS
- Load: ₱500 minimum

---

## 🌐 OPTION 3: TWILIO (Global Provider)

### Why Twilio?
- ✅ **$15 trial credits** (~₱850 = ~340 SMS)
- ✅ **Most popular** SMS API worldwide
- ✅ **Excellent docs** - easy to integrate
- ✅ **No geo-restrictions**

### Setup Steps:

#### 1. Register
- **Website:** https://www.twilio.com/try-twilio
- Create account
- Verify phone and email
- Get **$15 FREE credits!**

#### 2. Get Credentials
- Login to Console
- Get from Dashboard:
  - **Account SID**
  - **Auth Token**
  - **Phone Number** (trial or purchase)

#### 3. Install Twilio SDK
```bash
npm install twilio
```

#### 4. Configure
Create `smsService-twilio.js`:
```javascript
const twilio = require('twilio');

const client = twilio(
  'YOUR_ACCOUNT_SID',
  'YOUR_AUTH_TOKEN'
);

async function sendSMS(phoneNumber, message) {
  const result = await client.messages.create({
    body: message,
    from: '+1234567890',  // Your Twilio number
    to: `+63${phoneNumber.substring(1)}`,  // Convert 09xx to +639xx
  });
  return { success: true, messageId: result.sid };
}
```

### Pricing After Free Credits:
- Philippines: $0.06 per SMS (~₱3.50)
- Load: $20 = 330+ SMS

---

## 📊 COMPARISON TABLE

| Provider | Free Credits | Cost/SMS (PHP) | Setup Time | Reliability |
|----------|-------------|----------------|------------|-------------|
| **Vonage** | €2 (~₱120) | ₱2.50 | ⭐⭐⭐⭐⭐ (5 min) | ⭐⭐⭐⭐⭐ |
| **M360** | Trial varies | ₱0.40-0.60 | ⭐⭐⭐ (2-3 days) | ⭐⭐⭐⭐ |
| **Twilio** | $15 (~₱850) | ₱3.50 | ⭐⭐⭐⭐⭐ (5 min) | ⭐⭐⭐⭐⭐ |

---

## 🎯 MY RECOMMENDATION

### For Quick Testing: **VONAGE**
- Fast setup (5 minutes)
- Free credits to start
- No approval needed
- Works immediately

### For Production (Long-term): **M360**
- Cheapest per SMS
- Local support
- Better for high volume
- Philippine network optimized

### For Enterprise: **TWILIO**
- Most credits ($15)
- Best documentation
- Most reliable
- Used by major companies

---

## 🚀 QUICK START (VONAGE - RECOMMENDED)

1. **Register:** https://dashboard.nexmo.com/sign-up
2. **Get API Key & Secret** from dashboard
3. **Setup:**
   ```bash
   mv smsService-vonage.js smsService.js
   ```
4. **Configure** API credentials
5. **Test:**
   ```bash
   node testSMS.js
   ```

---

## ✅ TESTING YOUR SETUP

Update `testSMS.js`:
```javascript
const { sendSMS } = require('./smsService');

async function test() {
  const result = await sendSMS(
    '09123456789',  // ← YOUR PHONE NUMBER
    'Test SMS from RFID System!'
  );
  console.log(result);
}

test();
```

Run test:
```bash
node testSMS.js
```

Check your phone - you should receive SMS! 📱

---

## 🆘 TROUBLESHOOTING

### Can't access Vonage/Twilio website?
**Try:**
- Use VPN (if blocked in your region)
- Try different browser
- Clear browser cache
- Use mobile data instead of WiFi

### Account not activated?
**Solutions:**
- Complete email verification
- Add payment method (even for trial)
- Contact support via live chat
- Wait 24 hours for approval

### SMS not received?
**Check:**
- Phone number format (09xxxxxxxxx)
- API credentials correct
- Network signal strong
- Not in spam/blocked list

---

## 📞 SUPPORT LINKS

- **Vonage:** https://developer.vonage.com/en/support
- **M360:** sales@m360.com.ph
- **Twilio:** https://support.twilio.com

---

## 🎉 YOU'RE READY!

Choose your provider:
1. ✅ Vonage (Fastest setup)
2. ✅ M360 (Cheapest, local)
3. ✅ Twilio (Most reliable)

Follow the setup steps above and start sending SMS! 🚀
