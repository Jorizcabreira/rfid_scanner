# Teacher Message Push Notifications Setup

## Overview
This system sends push notifications to parents whenever a teacher sends them a message, even when the app is closed.

## Architecture
1. **Teacher Web Interface** (`messages.html`) - Teachers send messages through web
2. **Notification Service** (`sendTeacherMessageNotifications.js`) - Monitors Firebase for new teacher messages
3. **Expo Push Notifications** - Delivers notifications to parent mobile devices
4. **Parent Mobile App** - Receives and displays notifications

## Installation Steps

### 1. Install Required Packages
```bash
npm install node-fetch
```

The other required packages (`firebase-admin`) are already installed.

### 2. Start the Notification Service

**Option A: Run in separate terminal**
```bash
node sendTeacherMessageNotifications.js
```

**Option B: Run as background service (Windows)**
```powershell
Start-Process -NoNewWindow -FilePath "node" -ArgumentList "sendTeacherMessageNotifications.js" -WorkingDirectory "c:\Users\Acer\rfid_scanner"
```

**Option C: Add to package.json scripts**
Add to your `package.json`:
```json
{
  "scripts": {
    "notifications": "node sendTeacherMessageNotifications.js",
    "start-all": "concurrently \"npm run notifications\" \"node server.js\" \"node otpServer.js\""
  }
}
```

Then run:
```bash
npm run notifications
```

### 3. Verify Parent App Has Push Token

Make sure parents have:
1. Opened the app at least once
2. Granted notification permissions
3. Their push token is saved to Firebase

Check in Firebase Console:
```
users/
  └─ {parentUserId}/
      └─ pushToken/
          ├─ token: "ExponentPushToken[xxxxxx]"
          ├─ platform: "android" or "ios"
          ├─ deviceId: "device model"
          └─ createdAt: timestamp
```

### 4. Test the System

**Test 1: Send a test notification**
```bash
node -e "const { testNotification } = require('./sendTeacherMessageNotifications'); testNotification('47567854', 'Hello! This is a test message');"
```

Replace `47567854` with an actual student ID.

**Test 2: Send a message from teacher web interface**
1. Go to teacher web dashboard
2. Select a student
3. Send a message
4. Parent should receive notification immediately

## How It Works

### 1. Teacher Sends Message
```javascript
// In messages.html
await db.ref('messages/' + studentId).push({
  text: "Hello parent!",
  sender: 'teacher',
  senderName: 'Ms. Teacher',
  timestamp: Date.now(),
  read: false
});
```

### 2. Notification Service Detects New Message
```javascript
// sendTeacherMessageNotifications.js monitors Firebase
db.ref('messages').on('child_added', async (studentSnapshot) => {
  // Listens for new teacher messages
  // Finds parent's push token
  // Sends push notification via Expo
});
```

### 3. Parent Receives Notification
```
📧 Message from Ms. Teacher
"Hello parent!"
```

Even if app is closed, notification appears in system tray.

### 4. Parent Opens App
- Notification clears
- Message appears in message screen
- Badge count updates

## Firebase Security Rules

Make sure your Firebase rules allow the notification service to read:

```json
{
  "rules": {
    "messages": {
      "$studentId": {
        ".read": true,
        ".write": true
      }
    },
    "students": {
      ".read": true
    },
    "users": {
      "$userId": {
        ".read": true,
        "pushToken": {
          ".write": true
        }
      }
    }
  }
}
```

## Monitoring the Service

### Check if service is running:
```powershell
Get-Process -Name node | Where-Object {
  $_.MainWindowTitle -like "*sendTeacherMessageNotifications*"
}
```

### View logs:
The service logs to console:
- ✅ Green checkmarks = Success
- ❌ Red X = Error
- 🔔 Bell = Notification sent
- 📨 Envelope = New message detected

### Stop the service:
```powershell
# Find process listening on messages
Get-Process -Name node | Stop-Process
```

## Troubleshooting

### Issue: "No parent token found"
**Solution:** Parent needs to:
1. Open the app
2. Allow notification permissions
3. Go to home screen (triggers token registration)

### Issue: "Push notification error: DeviceNotRegistered"
**Solution:** Parent's push token expired
1. Parent should close and reopen app
2. New token will be registered automatically

### Issue: Notifications not appearing
**Check:**
1. ✅ Notification service is running
2. ✅ Parent has granted notification permissions
3. ✅ Parent's push token is in Firebase
4. ✅ Teacher message was marked with `sender: 'teacher'`

### Issue: Service stops after computer sleep
**Solution:** Use process manager like `pm2`:
```bash
npm install -g pm2
pm2 start sendTeacherMessageNotifications.js --name "teacher-notifications"
pm2 startup  # Auto-start on boot
pm2 save
```

## Advanced: Running as Windows Service

Install `node-windows`:
```bash
npm install -g node-windows
```

Create service installer:
```javascript
// install-service.js
var Service = require('node-windows').Service;

var svc = new Service({
  name: 'RFID Teacher Notifications',
  description: 'Sends push notifications for teacher messages',
  script: 'C:\\Users\\Acer\\rfid_scanner\\sendTeacherMessageNotifications.js'
});

svc.on('install', function(){
  svc.start();
});

svc.install();
```

Run:
```bash
node install-service.js
```

## Testing Checklist

- [ ] npm install node-fetch completed
- [ ] Notification service starts without errors
- [ ] Parent app has push token in Firebase
- [ ] Test notification reaches parent device
- [ ] Teacher message triggers notification
- [ ] Notification appears when app is closed
- [ ] Tapping notification opens message screen
- [ ] Multiple parents can receive notifications

## Production Recommendations

1. **Use PM2 or similar** for auto-restart on crashes
2. **Set up logging** to file for debugging
3. **Monitor Firebase quota** for read/write operations
4. **Rate limiting** if sending to many parents
5. **Error notifications** to admin if service crashes

## API Endpoints (Future Enhancement)

You can also create an Express API:

```javascript
// Add to sendTeacherMessageNotifications.js
app.post('/api/notify-parent', async (req, res) => {
  const { studentId, message, teacherName } = req.body;
  
  const result = await notifyParentAboutMessage(studentId, teacherName, message);
  
  res.json(result);
});
```

## Support

For issues or questions:
1. Check Firebase Console for message delivery
2. Check logs in notification service terminal
3. Verify push token in Firebase
4. Test with simple notification first

---

**Status:** ✅ Ready for Production
**Last Updated:** November 15, 2025
