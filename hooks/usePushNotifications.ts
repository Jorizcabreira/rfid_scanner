// hooks/usePushNotifications.ts
import { useEffect } from 'react';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ✅ FIXED: Add default export
const usePushNotifications = () => {
  useEffect(() => {
    console.log('🔔 Setting up push notifications...');

    // Initialize badge count
    const initializeBadgeCount = async () => {
      try {
        const savedCount = await AsyncStorage.getItem('notificationBadgeCount');
        const count = savedCount ? parseInt(savedCount) : 0;
        await Notifications.setBadgeCountAsync(count);
        console.log('✅ Badge count initialized:', count);
      } catch (error) {
        console.error('❌ Error initializing badge count:', error);
      }
    };

    initializeBadgeCount();

    // Foreground message handler
    const notificationReceivedSubscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('📱 Notification received in foreground:', notification.request.content.title);
      
      // Auto-increment badge count when notification is received
      incrementBadgeCount();
    });

    // Notification response handler (when user taps notification)
    const notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('👆 User tapped notification:', response.notification.request.content.title);
      
      // Reset badge count when user opens app via notification
      resetBadgeCount();
    });

    return () => {
      console.log('🧹 Cleaning up notification listeners');
      notificationReceivedSubscription.remove();
      notificationResponseSubscription.remove();
    };
  }, []);

  // Function to increment badge count
  const incrementBadgeCount = async () => {
    try {
      const currentCount = await getBadgeCount();
      const newCount = currentCount + 1;
      
      await AsyncStorage.setItem('notificationBadgeCount', newCount.toString());
      await Notifications.setBadgeCountAsync(newCount);
      
      console.log('🔢 Badge count incremented to:', newCount);
      return newCount;
    } catch (error) {
      console.error('❌ Error incrementing badge count:', error);
    }
  };

  // Function to reset badge count
  const resetBadgeCount = async () => {
    try {
      await AsyncStorage.setItem('notificationBadgeCount', '0');
      await Notifications.setBadgeCountAsync(0);
      
      console.log('🔄 Badge count reset to 0');
    } catch (error) {
      console.error('❌ Error resetting badge count:', error);
    }
  };

  // Function to get current badge count
  const getBadgeCount = async (): Promise<number> => {
    try {
      const savedCount = await AsyncStorage.getItem('notificationBadgeCount');
      return savedCount ? parseInt(savedCount) : 0;
    } catch (error) {
      console.error('❌ Error getting badge count:', error);
      return 0;
    }
  };

  // Function to set specific badge count
  const setBadgeCount = async (count: number) => {
    try {
      await AsyncStorage.setItem('notificationBadgeCount', count.toString());
      await Notifications.setBadgeCountAsync(count);
      
      console.log('✅ Badge count set to:', count);
    } catch (error) {
      console.error('❌ Error setting badge count:', error);
    }
  };

  return {
    incrementBadgeCount,
    resetBadgeCount,
    getBadgeCount,
    setBadgeCount
  };
};

// ✅ FIXED: Add default export
export default usePushNotifications;