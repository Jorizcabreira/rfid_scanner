# Server Setup Instructions for Background Notifications

## Problem
Your notifications don't appear when the app is **CLOSED** because:
- Firebase listeners (`onValue`) only work when app is running
- `setTimeout` background tasks stop when app closes
- Expo local notifications can't be triggered without the app

## Solution
Use a **Node.js server** that runs 24/7 and sends push notifications via Firebase Cloud Messaging (FCM).

---

## Step 1: Update Your `server.js`

Replace your current `server.js` with this updated version:

```javascript
// server.js
const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Load your Firebase Admin SDK service account
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://YOUR-PROJECT-ID.firebaseio.com' // Replace with your project
});

const db = admin.database();

console.log('🚀 Notification Server Started');
console.log('📡 Listening for notification requests...');

// Listen for new notification requests
const notificationsRef = db.ref('notifications');

notificationsRef.on('child_added', async snapshot => {
  const notif = snapshot.val();
  const key = snapshot.key;
  
  if (!notif || notif.sent) {
    return; // Skip if already sent
  }

  try {
    console.log('📨 New notification request:', notif.title);
    
    // Get parent's Expo Push Token
    const parentSnap = await db.ref(`users/${notif.toParentId}/expoPushToken`).once('value');
    const parentData = parentSnap.val();
    
    if (!parentData || !parentData.token) {
      console.log('❌ No token found for parent:', notif.toParentId);
      
      // Try alternate location
      const altParentSnap = await db.ref(`parents/${notif.toParentId}`).once('value');
      const altParentData = altParentSnap.val();
      
      if (!altParentData || (!altParentData.fcmToken && !altParentData.expoPushToken)) {
        console.log('❌ No token in alternate location either');
        await snapshot.ref.update({ sent: true, error: 'No token found', sentAt: Date.now() });
        return;
      }
      
      parentData.token = altParentData.fcmToken || altParentData.expoPushToken;
    }

    const expoPushToken = parentData.token;
    console.log('✅ Found Expo Push Token for parent');

    // Send via Expo Push Notification Service
    const message = {
      to: expoPushToken,
      sound: 'default',
      title: notif.title,
      body: notif.body,
      data: notif.data || {},
      priority: notif.urgent ? 'high' : 'default',
      channelId: 'default',
    };

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    console.log('✅ Notification sent successfully:', result);

    // Mark as sent
    await snapshot.ref.update({ 
      sent: true, 
      sentAt: Date.now(),
      response: result
    });

  } catch (err) {
    console.error('❌ Error sending notification:', err);
    await snapshot.ref.update({ 
      sent: false, 
      error: err.message,
      errorAt: Date.now()
    });
  }
});

console.log('✅ Server is running and listening for notifications');

// Keep the process alive
process.on('SIGINT', () => {
  console.log('🛑 Server shutting down...');
  process.exit();
});
```

---

## Step 2: Install Required Dependencies

Run in your project root:

```bash
npm install firebase-admin node-fetch
```

---

## Step 3: Get Firebase Admin SDK Key

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Click the gear icon ⚙️ → **Project Settings**
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Save the downloaded file as `serviceAccountKey.json` in your project root

---

## Step 4: Update Your Database URL

In `server.js`, replace:
```javascript
databaseURL: 'https://YOUR-PROJECT-ID.firebaseio.com'
```

With your actual Firebase project URL (found in Firebase Console → Realtime Database)

---

## Step 5: Run Your Server

### Development (Local Testing):
```bash
node server.js
```

### Production (24/7 Hosting):

Deploy to a hosting service so it runs continuously:

**Option 1: Heroku (Free tier available)**
```bash
# Install Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

heroku login
heroku create your-app-name
git add .
git commit -m "Add notification server"
git push heroku main
```

**Option 2: Railway.app (Recommended)**
1. Go to [railway.app](https://railway.app)
2. Create new project
3. Deploy from GitHub repo
4. Add `serviceAccountKey.json` as environment variable

**Option 3: Render.com**
1. Go to [render.com](https://render.com)
2. Create new Web Service
3. Connect your GitHub repo
4. Deploy

---

## Step 6: Test the Setup

### Test 1: Check if server is running
```bash
node server.js
```
You should see:
```
🚀 Notification Server Started
📡 Listening for notification requests...
✅ Server is running and listening for notifications
```

### Test 2: Manually trigger a notification

Open Firebase Console → Realtime Database and add this data under `/notifications`:

```json
{
  "notifications": {
    "test123": {
      "toParentId": "YOUR_USER_ID",
      "title": "🧪 Test Notification",
      "body": "If you see this, the server is working!",
      "data": {
        "type": "test"
      },
      "urgent": true,
      "timestamp": 1234567890,
      "sent": false
    }
  }
}
```

Replace `YOUR_USER_ID` with an actual user ID from your database.

### Test 3: Test with your app

1. Open your app
2. Close the app completely
3. Have someone scan the student's RFID card
4. You should receive a notification even though the app is closed!

---

## How It Works

1. **App writes notification request** to `/notifications` in Firebase
2. **Server detects new request** (via `child_added` listener)
3. **Server gets parent's Expo Push Token** from Firebase
4. **Server sends push notification** via Expo's push service
5. **Notification appears on parent's phone** even if app is closed!

---

## Troubleshooting

### No notifications when app is closed?

**Check 1: Is server running?**
```bash
ps aux | grep node  # Check if server is running
```

**Check 2: Are tokens being saved?**
- Open Firebase Console
- Go to Realtime Database
- Check `/users/{userId}/expoPushToken`
- Should see: `{ token: "ExponentPushToken[...]", ... }`

**Check 3: Are notification requests being created?**
- Check `/notifications` in Firebase
- Should see new entries when student scans RFID

**Check 4: Server logs**
- Check server console for errors
- Look for "❌" error messages

### Getting "No token found" error?

Make sure your app is calling `registerForPushNotificationsAsync()` and saving the token properly.

In your app, add this debug function:
```javascript
const checkToken = async () => {
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  console.log('Current Token:', token);
  Alert.alert('Token', token);
};
```

---

## Security Best Practices

1. **Never commit `serviceAccountKey.json`** to git
   - Add to `.gitignore`:
     ```
     serviceAccountKey.json
     ```

2. **Use environment variables** for production:
   ```javascript
   const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
   ```

3. **Set Firebase rules** to prevent unauthorized writes:
   ```json
   {
     "rules": {
       "notifications": {
         ".write": "auth != null",
         ".read": "auth != null"
       }
     }
   }
   ```

---

## Next Steps

Once server is working:
1. ✅ Test with app closed
2. ✅ Test with phone locked
3. ✅ Test with different network conditions
4. ✅ Deploy server to production hosting
5. ✅ Set up server monitoring

---

## Questions?

Common issues:
- **Token not found**: Make sure `registerForPushNotificationsAsync()` runs on app start
- **Server not receiving**: Check Firebase rules allow writing to `/notifications`
- **Notifications not appearing**: Check notification permissions are granted
- **Server crashes**: Add error handling and restart mechanism

---

**Remember**: The server must be running 24/7 for closed-app notifications to work!
