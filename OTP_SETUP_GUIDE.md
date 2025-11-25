# 🔐 OTP Email Login Setup Guide

## Overview

Added **OTP (One-Time Password) email verification** to the parent login system for enhanced security. Users now receive a 6-digit code via email before logging in.

---

## 🎯 How It Works

1. **User enters credentials** (Parent UID, Email, Password)
2. **Clicks "Login"** → System sends OTP to email
3. **User receives email** with 6-digit code
4. **User enters OTP** in the app
5. **System verifies OTP** → Login successful ✅

---

## 📦 Installation

### Step 1: Install Dependencies

```bash
cd c:\Users\Acer\rfid_scanner
npm install nodemailer express cors
```

### Step 2: Setup Gmail App Password

1. **Go to Google Account Settings:**
   - Visit: https://myaccount.google.com/
   - Click "Security"

2. **Enable 2-Step Verification:**
   - Find "2-Step Verification"
   - Follow prompts to enable it

3. **Create App Password:**
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Windows Computer"
   - Click "Generate"
   - **Copy the 16-character password** (e.g., `abcd efgh ijkl mnop`)

### Step 3: Configure Email Service

Open `emailService.js` and update:

```javascript
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: 'your-email@gmail.com',        // ← Your Gmail address
    pass: 'abcd efgh ijkl mnop'          // ← Your App Password (16 chars)
  }
});
```

Also update the `from` field:

```javascript
from: 'RFID Attendance System <your-email@gmail.com>',  // ← Your Gmail
```

---

## 🚀 Running the OTP Server

### Method 1: Local Development

```bash
# Start OTP server
node otpServer.js
```

You should see:
```
🚀 OTP Email Server Started
📡 Server running on port 3001
✅ Ready to send OTP emails

Endpoints:
  POST http://localhost:3001/api/send-otp
  POST http://localhost:3001/api/verify-otp
```

### Method 2: Production Deployment (Railway.app)

1. **Install Railway CLI:**
```bash
npm install -g @railway/cli
```

2. **Login to Railway:**
```bash
railway login
```

3. **Create New Project:**
```bash
railway init
```

4. **Deploy:**
```bash
railway up
```

5. **Get Your URL:**
```bash
railway domain
```

Example URL: `https://your-app-name.railway.app`

6. **Update App Configuration:**

Open `app/index.tsx` and update the OTP_SERVER_URL:

```typescript
const OTP_SERVER_URL = 'https://your-app-name.railway.app'; // Production
// const OTP_SERVER_URL = 'http://localhost:3001'; // Development
```

---

## 🔧 Configuration

### OTP Settings

In `emailService.js`:

```javascript
// OTP expiration time (5 minutes)
expiresAt: Date.now() + (5 * 60 * 1000)

// Maximum verification attempts (3)
if (data.attempts >= 3) { ... }

// OTP length (6 digits)
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
```

### Resend Cooldown

In `app/index.tsx`:

```typescript
setOtpExpiry(300);      // 5 minutes expiry
setResendCooldown(60);  // 1 minute before resend allowed
```

---

## 📧 Email Template

The OTP email includes:

- **Professional header** with gradient background
- **Large, clear OTP code** in monospace font
- **Expiration warning** (5 minutes)
- **Security reminder** (don't share code)
- **Responsive design** for all devices

---

## 🧪 Testing

### Test 1: Send OTP

1. Open parent app
2. Enter valid Parent UID and Email
3. Click "LOGIN TO PARENT PORTAL"
4. Check email for 6-digit code
5. Verify email arrives within 10 seconds

### Test 2: Verify OTP

1. Enter the 6-digit code from email
2. Click "✓ Verify & Login"
3. Should log in successfully

### Test 3: Expired OTP

1. Send OTP
2. Wait 5 minutes
3. Try to verify → Should show "OTP expired"
4. Click "🔄 Resend OTP"

### Test 4: Wrong OTP

1. Send OTP
2. Enter incorrect code (e.g., 111111)
3. Should show "Invalid OTP. 2 attempts remaining"
4. After 3 wrong attempts → Must request new OTP

---

## 🔒 Security Features

### ✅ What's Protected:

1. **Time-Limited OTP**
   - Expires after 5 minutes
   - Automatically deleted from database

2. **Limited Attempts**
   - Maximum 3 verification attempts
   - After 3 failures, must request new OTP

3. **One-Time Use**
   - OTP can only be used once
   - Marked as verified after success

4. **Resend Protection**
   - 60-second cooldown between resend requests
   - Prevents spam/abuse

5. **Email-Based Verification**
   - Only valid email receives code
   - Verifies user owns the email account

---

## 🐛 Troubleshooting

### Issue: "Failed to send OTP"

**Solution:**
1. Check OTP server is running: `node otpServer.js`
2. Verify Gmail credentials in `emailService.js`
3. Check App Password is correct (16 characters)
4. Ensure 2-Step Verification is enabled

### Issue: "OTP Email not receiving"

**Solution:**
1. Check spam/junk folder
2. Verify email address is correct
3. Check server logs for errors
4. Test with different email provider (Yahoo, Outlook)

### Issue: "Network request failed"

**Solution:**
1. **Development:** Ensure `http://localhost:3001` is accessible
2. **Production:** Update OTP_SERVER_URL with Railway URL
3. Check firewall/antivirus not blocking port 3001

### Issue: "Invalid OTP"

**Solution:**
1. Ensure OTP is exactly 6 digits
2. Check OTP hasn't expired (5 minutes)
3. Don't add spaces or special characters
4. Request new OTP if unsure

---

## 📝 Firebase Database Structure

OTP data is stored in Firebase:

```
otpVerifications/
  email_example_com/         // Email with dots replaced by underscores
    otp: "123456"
    parentUid: "4227545631"
    createdAt: 1699900000000
    expiresAt: 1699900300000  // +5 minutes
    verified: false
    attempts: 0
```

---

## 🔄 How to Disable OTP (Optional)

If you want to revert to old login without OTP:

1. Open `app/index.tsx`
2. Find `handleLogin` function
3. Replace with:

```typescript
const handleLogin = useCallback(async () => {
  if (loginAttemptRef.current) return;
  if (!validateForm()) return;

  // Use old login without OTP
  await handleLoginOld(); // Uncomment the old code
}, [validateForm]);
```

---

## 📊 Benefits

### For Parents:
- ✅ Extra security layer
- ✅ Email verification ensures identity
- ✅ Protection against unauthorized access
- ✅ Clear visual feedback

### For School:
- ✅ Reduced fraudulent logins
- ✅ Audit trail in Firebase
- ✅ Email verification proof
- ✅ Compliance with security standards

---

## 📞 Support

### Common Questions:

**Q: How long is the OTP valid?**
A: 5 minutes from the time it's sent

**Q: How many times can I try entering OTP?**
A: 3 attempts per OTP. After that, request a new one.

**Q: What if I don't receive the email?**
A: Check spam folder, verify email address, and ensure server is running

**Q: Can I use a different email service (not Gmail)?**
A: Yes! Update `emailService.js` with your email provider's SMTP settings

**Q: Is OTP required for every login?**
A: Yes, for enhanced security. Session lasts 8 hours after successful login.

---

## 🎉 Setup Complete!

You now have a secure OTP email verification system for parent login! 

**Next Steps:**
1. ✅ Start OTP server: `node otpServer.js`
2. ✅ Test with real email
3. ✅ Deploy to production (Railway)
4. ✅ Update app with production URL

**Files Created:**
- `emailService.js` - Email sending logic
- `otpServer.js` - Express server for OTP
- `OTP_SETUP_GUIDE.md` - This guide

**Files Modified:**
- `app/index.tsx` - Login screen with OTP UI
