import React, {useEffect} from 'react';
import {View, Text} from 'react-native';
// Removed React Native Firebase - using Expo Notifications instead

// Notification handling moved to Expo Notifications in message.tsx

export default function App() {
  return (
    <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
      <Text>Expo Push Notification Setup ✅</Text>
    </View>
  );
}
// Sa main App.js mo, idagdag ito:
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

// Define background task
TaskManager.defineTask('BACKGROUND_NOTIFICATION_TASK', ({ data, error }) => {
  if (error) {
    console.error('Background task error:', error);
    return;
  }
  console.log('Received background notification:', data);
});

// Register background task
Notifications.registerTaskAsync('BACKGROUND_NOTIFICATION_TASK');
