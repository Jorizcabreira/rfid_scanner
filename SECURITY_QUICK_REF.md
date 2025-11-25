# 🔒 Security Quick Reference Card

## For Testing (Quick Commands)

### Test Rate Limiting:
1. Open app
2. Click login 6 times rapidly → Should see "Too Many Requests"

### Test Account Lockout:
1. Wrong password 5 times → Should see red banner with countdown
2. Close/reopen app → Lockout persists

### Test Input Validation:
- Parent UID: `test<script>` → Should reject
- Email: `notanemail` → Should reject
- Password: `pass` → Should reject (too short)

## Security Features at a Glance

| Feature | Setting | What It Does |
|---------|---------|--------------|
| **Rate Limiting** | 5 per minute | Blocks rapid login attempts |
| **Account Lockout** | 5 fails = 15 min | Locks after failed attempts |
| **Session Timeout** | 8 hours | Auto-logout after timeout |
| **Input Validation** | Always on | Blocks malicious input |
| **Audit Logging** | Always on | Logs all attempts to Firebase |

## User Messages

### Rate Limited:
```
⚠️ Too Many Requests
You are making too many login attempts.
Please wait a moment before trying again.
```

### Account Locked:
```
🔒 Account Temporarily Locked
Too many failed login attempts.
Please wait 15 minute(s) before trying again.
```

### Failed Attempt:
```
Login Failed
The email or password is incorrect.

Remaining attempts: 3
```

## Firebase Console Quick Links

**Console:** https://console.firebase.google.com/project/rfidattendance-595f4

**Check Security Logs:**
Database → parentLoginLog

**Deploy Rules:**
Database → Rules → Publish

**View Users:**
Authentication → Users

## Admin Actions

### View Failed Logins:
```javascript
Database → parentLoginLog
Filter: status === 'failed'
```

### View Lockouts:
```javascript
Database → parentLoginLog
Filter: status === 'suspicious'
```

### Process Password Reset:
```javascript
Database → passwordResetRequests
Status: pending → processed
```

## Configuration Values

```javascript
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION = 15 minutes
RATE_LIMIT_WINDOW = 1 minute
MAX_REQUESTS_PER_MINUTE = 5
SESSION_TIMEOUT = 8 hours
```

## Deployment Checklist

- [ ] Deploy `database.rules.json` to Firebase
- [ ] Test rate limiting (6 rapid attempts)
- [ ] Test lockout (5 failed logins)
- [ ] Verify lockout persists across restarts
- [ ] Test input validation
- [ ] Check logs appear in Firebase
- [ ] Inform users about new security

## Support Contacts

**For Users:**
- Locked out? Wait 15 minutes OR contact admin
- Forgot password? Click "Forgot Password?" button
- Need help? Contact school administration

**For Admins:**
- Security issues? Check parentLoginLog
- Need to unlock user? Clear lockout in database
- Questions? See SECURITY_IMPLEMENTATION.md

---

**Quick Start:** Deploy Firebase rules → Test features → Inform users
**Status:** ✅ Ready for Production
