# 📱 iProg SMS Quick Setup Guide

## Step 1: Register sa iProg SMS

### Option A: iProg.com.ph
1. **Visit:** https://www.iprog.com.ph/ or https://iprog.ph/
2. **Sign Up:**
   - Full Name
   - Email Address
   - Mobile Number (09XXXXXXXXX)
   - Company/Organization
   - Password
3. **Verify Email** - Check inbox and click verification link
4. **Verify Mobile** - Enter OTP sent to your phone

### Option B: Contact iProg Directly
If website not accessible:
- **Email:** sales@iprog.com.ph or support@iprog.com.ph
- **Facebook:** Search "iProg Philippines"
- **Viber/WhatsApp:** Ask for contact number
- **Call:** Look for contact number via Google

### Option C: Alternative - Use iProg Resellers
Look for SMS gateway resellers in Philippines that use iProg backend

---

## Step 2: Get API Credentials

After account approval (1-3 business days):

1. **Login to Dashboard**
2. **Go to:** API Settings / Developer Section
3. **Copy:**
   - **API Key** (example: `iprog_abc123def456`)
   - **Sender ID** (your registered mobile number or company name)

---

## Step 3: Configure Your Project

### Edit `smsService.js`:

```javascript
const IPROG_SMS_CONFIG = {
  apiUrl: 'https://api.iprog.com/v1/sms/send',
  apiKey: 'iprog_abc123def456',  // ← PASTE YOUR API KEY HERE
  senderId: '09123456789',        // ← YOUR REGISTERED NUMBER
};
```

**Note:** API URL might be different. Check iProg documentation for actual endpoint:
- Could be: `https://api.iprog.ph/sms/send`
- Or: `https://sms.iprog.com.ph/api/send`
- Verify with iProg support

---

## Step 4: Load Credits

### Payment Options:
1. **Bank Transfer** - Most common
2. **GCash** - If available
3. **PayMaya** - If available
4. **Over the Counter** - Some locations
5. **Check** - For bulk purchases

### Typical Pricing:
- Regular SMS: ₱0.40 - ₱0.80 per SMS
- Minimum load: ₱500 - ₱1,000
- Bulk discounts available

**Example:**
- ₱1,000 = ~1,250 - 2,500 SMS
- ₱5,000 = ~6,250 - 12,500 SMS

---

## Step 5: Test Your Setup

### Update testSMS.js:

```javascript
const { sendSMS, sendOTPSMS } = require('./smsService');

async function testBasicSMS() {
  console.log('Testing iProg SMS...\n');
  
  const result = await sendSMS(
    '09123456789',  // ← YOUR PHONE NUMBER
    'Hello! This is a test from iProg SMS. RFID Attendance System is working! 🎉'
  );
  
  console.log('Result:', result);
}

testBasicSMS();
```

### Run Test:
```bash
node testSMS.js
```

**Expected Output:**
```
📱 Sending SMS to 09123456789...
✅ SMS sent successfully: { message_id: 'xxx' }
Result: { success: true, messageId: 'xxx', data: {...} }
```

**Check your phone** - Should receive SMS in 5-30 seconds

---

## Step 6: Integrate with OTP System

Your `emailService.js` is already updated to support SMS!

### Test OTP Server:

1. **Start Server:**
```bash
node otpServer.js
```

2. **Test API:**
```bash
# Test with curl or Postman
curl -X POST http://localhost:3001/api/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "parent@example.com",
    "parentUid": "ABC123",
    "parentName": "Juan Dela Cruz",
    "phoneNumber": "09123456789",
    "sendVia": "sms"
  }'
```

---

## 🔧 Troubleshooting

### Problem: "Cannot access iProg website"

**Solutions:**
1. **Try different URLs:**
   - https://www.iprog.com.ph/
   - https://iprog.ph/
   - https://iprog.com/

2. **Contact via social media:**
   - Facebook: Search "iProg SMS Philippines"
   - LinkedIn: Search "iProg Philippines"

3. **Ask for referral:**
   - Contact existing iProg users
   - Ask for sales representative contact

4. **Use resellers:**
   - Many SMS gateway resellers use iProg
   - Search "SMS gateway Philippines"

### Problem: "Account not approved"

**What to do:**
- Wait 1-3 business days
- Check email for approval notification
- Contact support if delayed
- Provide business/school documents if required

### Problem: "Invalid API Key"

**Fixes:**
- Copy API key exactly (no spaces)
- Check if key is activated
- Verify account has credits
- Check API endpoint URL is correct
- Contact iProg support

### Problem: "SMS not sending"

**Checklist:**
- [ ] API key configured correctly
- [ ] Account has sufficient credits
- [ ] Phone number format correct (09XXXXXXXXX)
- [ ] Sender ID registered and approved
- [ ] API endpoint URL correct
- [ ] Internet connection working

---

## 📊 API Endpoint Format

iProg may use different formats. Try these:

### Format 1: JSON API
```javascript
const response = await fetch('https://api.iprog.com/v1/sms/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    sender: senderId,
    recipient: phoneNumber,
    message: text,
  }),
});
```

### Format 2: Query String
```javascript
const url = `https://api.iprog.ph/send?` +
  `apikey=${apiKey}&` +
  `number=${phoneNumber}&` +
  `message=${encodeURIComponent(text)}&` +
  `sender=${senderId}`;

const response = await fetch(url);
```

### Format 3: Form Data
```javascript
const params = new URLSearchParams({
  apikey: apiKey,
  number: phoneNumber,
  message: text,
  sender: senderId,
});

const response = await fetch('https://api.iprog.com.ph/sms', {
  method: 'POST',
  body: params,
});
```

**Always check iProg documentation for the correct format!**

---

## 💡 Important Notes

1. **Sender ID Registration:**
   - Must register sender name/number
   - Approval takes 1-2 days
   - Only registered IDs can be used

2. **Message Limits:**
   - 160 characters = 1 SMS
   - 161-306 characters = 2 SMS
   - More characters = more cost

3. **Network Coverage:**
   - iProg supports: Globe, Smart, Sun, TNT, TM
   - Check if all networks included in your plan

4. **Credits Balance:**
   - Monitor credits regularly
   - Set up low balance alerts
   - Auto-reload if available

5. **API Rate Limits:**
   - Check maximum requests per second
   - Add delays between bulk SMS (1 second recommended)
   - Contact iProg for higher limits

---

## 📞 iProg Contact Information

**Primary:**
- Website: https://www.iprog.com.ph/
- Email: sales@iprog.com.ph
- Email: support@iprog.com.ph

**Social Media:**
- Facebook: Search "iProg Philippines"
- LinkedIn: Search company "iProg"

**Alternative Contacts:**
- Look for local SMS gateway providers
- Ask in Philippine tech/developer groups
- Check SMS provider review sites

---

## ✅ Setup Checklist

- [ ] iProg account created
- [ ] Email verified
- [ ] Mobile number verified
- [ ] Account approved (1-3 days)
- [ ] API credentials obtained
- [ ] Sender ID registered
- [ ] Credits loaded
- [ ] API key configured in smsService.js
- [ ] Test SMS sent successfully
- [ ] OTP server updated
- [ ] Phone numbers added to Firebase database

---

## 🎯 Next Steps

1. **If iProg accessible:**
   - Register account
   - Wait for approval
   - Load credits
   - Start testing

2. **If iProg NOT accessible:**
   - Check FREE_SMS_OPTIONS.md
   - Try Movider or iTEXMO instead
   - Or use Firebase Phone Auth (100% free)

3. **Need help?**
   - Contact iProg support
   - Check their documentation
   - Join PH developer communities

---

**Good luck with iProg SMS setup!** 🚀

Para sa alternative FREE options, check: **FREE_SMS_OPTIONS.md**
