# OTP Email Troubleshooting Guide

## Problem: OTP Email Takes Too Long to Send

### Quick Fixes

#### 1. Check if OTP Server is Running
```powershell
# Check if server is running on port 3001
Get-Process -Name node | Where-Object {(Get-NetTCPConnection -OwningProcess $_.Id -ErrorAction SilentlyContinue).LocalPort -eq 3001}
```

If not running, start it:
```bash
node otpServer.js
```

#### 2. Verify Your IP Address
```powershell
# Get your current WiFi IP address
Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*"}
```

**Current IP Configuration:**
- **WiFi IP:** `10.242.224.29` (update in `app/index.tsx` if it changes)
- **OTP Server Port:** `3001`

#### 3. Update IP Address in Code
If your IP address changed, update in `app/index.tsx` (around line 783):
```typescript
const OTP_SERVER_URL = 'http://YOUR_NEW_IP:3001';
```

#### 4. Test OTP Server
```powershell
# Test if server is accessible
curl http://10.242.224.29:3001/ | ConvertFrom-Json
```

Should return:
```json
{
  "status": "running",
  "message": "🔐 OTP Email Service is active"
}
```

### Performance Improvements Made

1. **Added 15-second timeout** - Prevents infinite loading if server is unreachable
2. **Connection pooling** - Reuses SMTP connections for faster delivery
3. **Optimized timeouts:**
   - Connection timeout: 5 seconds
   - Greeting timeout: 3 seconds
   - Socket timeout: 10 seconds
4. **Better error messages** - Shows specific reason for failure
5. **Performance logging** - Shows how long each step takes

### Expected Performance

- **Firebase save:** < 1 second
- **Email sending:** 2-5 seconds (first time), 1-3 seconds (subsequent)
- **Total request:** 3-6 seconds

### Common Issues

#### Issue: "Cannot connect to email server"
**Cause:** OTP server not running or IP address incorrect
**Fix:** 
1. Start OTP server: `node otpServer.js`
2. Verify IP address matches your WiFi IP
3. Ensure phone and computer are on same network

#### Issue: "Email server is taking too long"
**Cause:** Gmail SMTP server is slow or connection timeout
**Fix:**
1. Check internet connection
2. Verify Gmail credentials are correct
3. Restart OTP server to refresh connection pool

#### Issue: OTP takes 10-15 seconds
**Cause:** First connection to Gmail SMTP is establishing
**Fix:** This is normal for first email. Subsequent emails will be faster (1-3s) due to connection pooling.

### Monitoring Performance

Check the terminal running `otpServer.js` for performance logs:
```
🔄 OTP Request received for: parent@email.com
✅ OTP generated
✅ OTP saved to Firebase
📧 Attempting to send OTP to parent@email.com...
✅ OTP Email sent successfully in 2.34s: <message-id>
✅ Total request completed in 2.89s
```

### Network Requirements

- **Computer and phone must be on the same WiFi network**
- **Firewall must allow connections on port 3001**
- **No VPN or proxy blocking local network**

### Quick Checklist

- [ ] OTP server is running (`node otpServer.js`)
- [ ] IP address in code matches your WiFi IP
- [ ] Phone and computer on same network
- [ ] Port 3001 is not blocked by firewall
- [ ] Gmail credentials are correct
- [ ] Internet connection is working

### Testing OTP Manually

```bash
# Send test OTP request
curl -X POST http://10.242.224.29:3001/api/send-otp -H "Content-Type: application/json" -d "{\"email\":\"test@email.com\",\"parentUid\":\"12345\",\"parentName\":\"Test Parent\"}"
```

### Still Not Working?

1. Restart OTP server
2. Clear app cache and rebuild
3. Check firewall settings
4. Verify Gmail App Password is valid
5. Check server logs for specific error messages
