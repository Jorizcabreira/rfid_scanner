# Quick Start: Get Notifications Working in 5 Minutes

## The Problem
**Your notifications don't show when the app is closed** because Firebase listeners only work when the app is running.

## The Solution
Run a server that listens 24/7 and sends notifications via Expo Push.

---

## 🚀 Quick Setup (5 minutes)

### Step 1: Install packages (1 min)
```bash
npm install firebase-admin node-fetch
```

### Step 2: Get Firebase key (2 min)
1. Go to https://console.firebase.google.com
2. Click your project
3. Click ⚙️ (gear icon) → **Project Settings**
4. Click **Service Accounts** tab
5. Click **Generate New Private Key**
6. Save as `serviceAccountKey.json` in project root

### Step 3: Update server.js (30 sec)
Open `server.js` and replace this line:
```javascript
databaseURL: 'https://YOUR-PROJECT-ID.firebaseio.com'
```

With your actual URL from Firebase Console → Realtime Database URL

### Step 4: Run server (30 sec)
```bash
node server.js
```

You should see:
```
🚀 Notification Server Started
📡 Listening for notification requests...
✅ Server is running and listening for notifications
```

### Step 5: Test! (1 min)
1. Open your app on phone
2. **Close the app completely** (swipe away from task manager)
3. Have someone scan the student's RFID card
4. **You should get a notification!** 🎉

---

## ✅ Expected Behavior

### When app is OPEN:
- ✅ Instant notifications (already working)

### When app is CLOSED:
- ✅ Notifications appear on locked screen
- ✅ Sound plays
- ✅ Badge shows on app icon
- ✅ Works even in background

---

## 🐛 Not Working?

### Problem: No notification when app closed

**Check 1**: Is server running?
```bash
ps aux | grep node
```
Should show `node server.js` running

**Check 2**: Is token saved?
- Open Firebase Console
- Go to Database
- Check `/users/{yourUserId}/expoPushToken`
- Should have a token like `ExponentPushToken[xxxxxx]`

**Check 3**: Are requests being created?
- Check `/notifications` in Firebase Database
- Should see new entries when RFID is scanned

**Check 4**: Check server console
- Look for error messages (❌)
- Should see "✅ Notification sent successfully"

### Problem: "No token found"

**Fix**: 
1. Open app
2. Grant notification permission when prompted
3. Close and reopen app
4. Check Firebase for token again

### Problem: Server crashes

**Fix**:
```bash
# Check if serviceAccountKey.json exists
ls serviceAccountKey.json

# Check if packages are installed
npm list firebase-admin node-fetch

# Reinstall if needed
npm install firebase-admin node-fetch
```

---

## 🌐 Deploy for 24/7 (Required for Production)

### Option 1: Railway.app (Recommended - Free)
1. Go to https://railway.app
2. Sign up with GitHub
3. Click **New Project** → **Deploy from GitHub repo**
4. Select your repo
5. Add `serviceAccountKey.json` content as environment variable
6. Deploy! ✅

### Option 2: Render.com (Free)
1. Go to https://render.com
2. Sign up
3. Click **New** → **Web Service**
4. Connect GitHub repo
5. Set build command: `npm install`
6. Set start command: `node server.js`
7. Add environment variables
8. Deploy! ✅

---

## 📋 Testing Checklist

Before deploying to production, test:

- [ ] App open → Notification works ✅
- [ ] App closed → Notification works ✅
- [ ] Phone locked → Notification works ✅
- [ ] Phone in sleep → Notification works ✅
- [ ] App killed → Notification works ✅
- [ ] Different times → Notifications work ✅

---

## 🎯 Key Points

1. **Server must run 24/7** for closed-app notifications
2. **Token must be saved** when app first opens
3. **Permissions must be granted** by user
4. **Test thoroughly** before relying on it

---

## 📝 What Changed in Your Code

I updated your `home.tsx` to:

1. ✅ Save Expo Push Token to Firebase (enhanced)
2. ✅ Create notification "jobs" for server
3. ✅ Send notifications two ways:
   - Local (when app is open)
   - Server (when app is closed)

The server (`server.js`) listens for these "jobs" and sends push notifications.

---

## ❓ Still Having Issues?

1. Check `NOTIFICATION_FIX_SUMMARY.md` for detailed explanation
2. Check `SERVER_SETUP_INSTRUCTIONS.md` for step-by-step guide
3. Check server console for error messages
4. Check Firebase Console for data

---

## 🎉 Success!

Once working, you'll get notifications:
- When student arrives at school (Time In)
- When student leaves school (Time Out)  
- When student is picked up
- Even when app is completely closed! 🎯

**Note**: Remember to deploy the server to a hosting service so it runs 24/7!
