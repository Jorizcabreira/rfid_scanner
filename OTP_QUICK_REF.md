# 🔐 OTP Login - Quick Reference

## 📦 Setup (5 Minutes)

```bash
# 1. Install packages
npm install nodemailer express cors

# 2. Get Gmail App Password
# Visit: https://myaccount.google.com/apppasswords
# Create app password (16 chars)

# 3. Update emailService.js
user: 'your-email@gmail.com'
pass: 'your-app-password'

# 4. Start server
node otpServer.js
```

---

## 🎯 How It Works

```
User Login → Send OTP Email → Enter Code → Verify → Success ✅
  (UID+Email)    (6-digit)      (Input)     (Check)   (Home)
```

---

## 💻 Commands

```bash
# Development
node otpServer.js                    # Start OTP server (port 3001)

# Production Deploy (Railway)
npm install -g @railway/cli          # Install CLI
railway login                        # Login
railway init                         # Create project
railway up                           # Deploy
railway domain                       # Get URL
```

---

## 🔧 Configuration

| Setting | Value | Location |
|---------|-------|----------|
| OTP Length | 6 digits | `emailService.js` |
| Expiry Time | 5 minutes | `emailService.js` |
| Max Attempts | 3 tries | `emailService.js` |
| Resend Cooldown | 60 seconds | `app/index.tsx` |
| Server Port | 3001 | `otpServer.js` |

---

## 📧 Email Settings

### Gmail Setup:
1. Enable 2-Step Verification
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Update `emailService.js`:
   ```javascript
   auth: {
     user: 'your-email@gmail.com',
     pass: 'abcd efgh ijkl mnop'  // App password
   }
   ```

### Other Providers (Yahoo, Outlook, etc.):
```javascript
// Yahoo
service: 'yahoo'

// Outlook
service: 'hotmail'

// Custom SMTP
host: 'smtp.example.com',
port: 587,
secure: false
```

---

## 🧪 Testing Checklist

- [ ] OTP server running (`node otpServer.js`)
- [ ] Email arrives within 10 seconds
- [ ] OTP code is 6 digits
- [ ] Code expires after 5 minutes
- [ ] Wrong code shows error
- [ ] Correct code logs in
- [ ] Resend works after 60 seconds

---

## 🐛 Quick Fixes

| Problem | Solution |
|---------|----------|
| Email not received | Check spam, verify Gmail credentials |
| "Failed to send OTP" | Start server: `node otpServer.js` |
| "Network error" | Update OTP_SERVER_URL in app/index.tsx |
| "Invalid OTP" | Check 6 digits, not expired, no spaces |
| Server won't start | Install: `npm install nodemailer express cors` |

---

## 📁 Files

```
emailService.js       → Email sending + OTP logic
otpServer.js          → Express API server
app/index.tsx         → Login UI with OTP
OTP_SETUP_GUIDE.md    → Full documentation
```

---

## 🔒 Security

✅ 5-minute expiration
✅ 3 attempts max
✅ One-time use only
✅ 60-second resend cooldown
✅ Email ownership verification

---

## 📊 API Endpoints

```
POST /api/send-otp
Body: { email, parentUid, parentName }
Response: { success: true, message: "OTP sent" }

POST /api/verify-otp
Body: { email, otp }
Response: { success: true, message: "Verified" }
```

---

## 🎨 UI States

```
1. Initial: Parent UID, Email, Password fields
2. OTP Sent: Shows OTP input + timer + resend button
3. Verifying: Loading spinner
4. Success: Navigate to home
5. Error: Show error message
```

---

## 🔄 Production URL

After Railway deployment, update in `app/index.tsx`:

```typescript
// Replace localhost with your Railway URL
const OTP_SERVER_URL = 'https://your-app.railway.app';
```

---

## 📞 Quick Help

**OTP not working?**
1. Check server running: `node otpServer.js`
2. Verify Gmail App Password
3. Check Firebase for `otpVerifications` node
4. Test with: `curl http://localhost:3001/`

**Need to disable OTP temporarily?**
Comment out OTP logic in `handleLogin` function

---

## ✅ Success Indicators

When working correctly, you'll see:

**Server Console:**
```
✅ OTP Email sent successfully: <message-id>
✅ OTP saved to Firebase
✅ OTP verified successfully!
```

**Parent App:**
```
📧 OTP Sent
A 6-digit verification code has been sent to email@example.com
```

**Email:**
Professional email with 6-digit code arrives within 10 seconds

---

## 🚀 Quick Start Script

Save as `start-otp.bat` (Windows) or `start-otp.sh` (Mac/Linux):

```bash
@echo off
echo Starting OTP Email Server...
cd c:\Users\Acer\rfid_scanner
node otpServer.js
pause
```

Double-click to run!

---

**Ready to go! 🎉**
