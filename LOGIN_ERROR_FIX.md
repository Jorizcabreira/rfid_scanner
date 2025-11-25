# 🔧 Login Error Fix Guide

## Error: auth/invalid-credential

### What This Means:
```
✅ Parent UID: CORRECT (4227545631)
✅ Email: CORRECT (cjoriz441@gmail.com)
❌ Password: WRONG or Account doesn't exist
```

The parent credentials are verified in the database, but Firebase Authentication is rejecting the login. This happens when:

1. **Password is incorrect**
2. **User account doesn't exist in Firebase Authentication**
3. **Password was recently changed**

---

## 🔍 Step 1: Check if User Exists

Run this command to check:

```bash
cd c:\Users\Acer\rfid_scanner
node checkUserAuth.js
```

**Expected outputs:**

### If User EXISTS:
```
✅ User EXISTS in Firebase Authentication!
User details: {
  uid: 'abc123',
  email: 'cjoriz441@gmail.com',
  emailVerified: true,
  disabled: false
}
```
→ **Solution:** Password is wrong. Reset password in Firebase Console or use forgot password.

### If User DOESN'T EXIST:
```
❌ User DOES NOT EXIST in Firebase Authentication

📝 Solution: Create this user account in Firebase Authentication
   Email: cjoriz441@gmail.com
```
→ **Solution:** Create the user account (see Step 2)

---

## 🔧 Step 2: Create User Account (If Doesn't Exist)

### Option 1: Automatic Script (EASIEST)

```bash
cd c:\Users\Acer\rfid_scanner
node createParentUser.js
```

This will:
- ✅ Create user in Firebase Authentication
- ✅ Set email: cjoriz441@gmail.com
- ✅ Set password: password123 (change in script if needed)
- ✅ Add to users and parents collections
- ✅ Link to Parent UID: 4227545631

### Option 2: Manual via Firebase Console

1. **Go to Firebase Console:**
   https://console.firebase.google.com/project/rfidattendance-595f4

2. **Navigate to Authentication:**
   - Click "Authentication" in left sidebar
   - Click "Users" tab
   - Click "Add user" button

3. **Enter Details:**
   ```
   Email: cjoriz441@gmail.com
   Password: password123
   ```

4. **Click "Add user"**

5. **Update Realtime Database:**
   - Go to Realtime Database
   - Add to `users/{uid}`:
     ```json
     {
       "email": "cjoriz441@gmail.com",
       "name": "Rommel Cacho",
       "role": "parent",
       "parentUid": "4227545631"
     }
     ```

---

## 🔑 Step 3: Test Login

After creating the user account:

1. **Open parent app**
2. **Enter credentials:**
   ```
   Parent UID: 4227545631
   Email: cjoriz441@gmail.com
   Password: password123
   ```
3. **Click Login**
4. **Should succeed!** ✅

---

## 🔄 Step 4: Reset Password (If Needed)

### If user exists but password is wrong:

**Option 1: Firebase Console**
1. Go to Authentication → Users
2. Find user: cjoriz441@gmail.com
3. Click "..." menu → Reset password
4. Copy temporary password
5. Give to parent

**Option 2: Forgot Password in App**
1. Click "Forgot Password?" in app
2. Enter Parent UID and Email
3. Admin receives request
4. Admin sets new password
5. Admin contacts parent with new password

---

## 📊 Current Status

Based on error logs:

```
✅ Parent UID verified: 4227545631
✅ Email verified: cjoriz441@gmail.com
✅ Guardian matched: Rommel Cacho
✅ Student matched: Maria Yssabelle (4196846271)
❌ Firebase Authentication: FAILED (invalid-credential)
```

**Most Likely Cause:** User account doesn't exist in Firebase Authentication

**Solution:** Run `node createParentUser.js` to create the account

---

## 🎯 Quick Fix Commands

### Check User:
```bash
node checkUserAuth.js
```

### Create User:
```bash
node createParentUser.js
```

### Test Login:
```
Parent UID: 4227545631
Email: cjoriz441@gmail.com
Password: password123
```

---

## 🔒 Security Note

The account lockout is working correctly:
```
🔒 Failed attempt #5 for 4227545631_cjoriz441@gmail.com
```

After 5 failed attempts, the account will be locked for 15 minutes. This is a security feature to prevent brute force attacks.

**To unlock:**
- Wait 15 minutes for automatic unlock
- Or restart the app to clear the counter (temporary)

---

## 📝 Updated Error Message

The app now shows a more helpful error message:

```
Your Parent UID and email are correct, but the password is incorrect.

Possible reasons:
• Wrong password
• Account not yet created in system
• Password was changed recently

Remaining attempts: 0

Please contact school administration if you don't know your password.
```

---

## ✅ Summary

**Problem:** Parent credentials are in database but Firebase Auth login fails

**Diagnosis:**
1. Run `node checkUserAuth.js` to check if user exists
2. If doesn't exist → Run `node createParentUser.js`
3. If exists → Password is wrong, use forgot password

**Quick Fix:**
```bash
# Create user account
node createParentUser.js

# Test login with:
# UID: 4227545631
# Email: cjoriz441@gmail.com
# Password: password123
```

**Status:** Ready to fix! Run the commands above.
