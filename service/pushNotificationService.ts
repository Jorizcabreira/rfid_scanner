import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { getAuth } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { Platform } from 'react-native';
import { database } from '../firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure notification handling - FIXED VERSION
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true, // Added for iOS
    shouldShowList: true,   // Added for iOS
  }),
});

export class PushNotificationService {
  private static instance: PushNotificationService;
  private token: string | null = null;
  private notifications: any[] = [];
  private readonly STORAGE_KEY = 'push_notifications';

  static getInstance(): PushNotificationService {
    if (!PushNotificationService.instance) {
      PushNotificationService.instance = new PushNotificationService();
    }
    return PushNotificationService.instance;
  }

  constructor() {
    this.loadNotifications();
  }

  // Load notifications from storage
  private async loadNotifications(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.notifications = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading notifications from storage:', error);
    }
  }

  // Save notifications to storage
  private async saveNotifications(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.notifications));
    } catch (error) {
      console.error('Error saving notifications to storage:', error);
    }
  }

  // Add notification to local storage
  async addNotification(data: any): Promise<void> {
    try {
      const notification = {
        id: Date.now().toString(),
        title: data.title || 'Notification',
        body: data.body || '',
        data: data,
        timestamp: new Date().toISOString(),
        read: false
      };

      this.notifications.unshift(notification); // Add to beginning
      
      // Keep only last 50 notifications
      if (this.notifications.length > 50) {
        this.notifications = this.notifications.slice(0, 50);
      }

      await this.saveNotifications();
    } catch (error) {
      console.error('Error adding notification:', error);
    }
  }

  // Get all notifications
  async getAllNotifications(): Promise<any[]> {
    return this.notifications;
  }

  // Get unread notifications count
  async getUnreadCount(): Promise<number> {
    return this.notifications.filter(notification => !notification.read).length;
  }

  // Mark notification as read
  async markAsRead(notificationId: string): Promise<void> {
    try {
      const notification = this.notifications.find(n => n.id === notificationId);
      if (notification) {
        notification.read = true;
        await this.saveNotifications();
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  // Mark all notifications as read
  async markAllAsRead(): Promise<void> {
    try {
      this.notifications.forEach(notification => {
        notification.read = true;
      });
      await this.saveNotifications();
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }

  // Clear all notifications
  async clearNotifications(): Promise<void> {
    try {
      this.notifications = [];
      await AsyncStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }

  // Set badge count
  async setBadgeCount(count: number): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(count);
      console.log(`Badge count set to: ${count}`);
    } catch (error) {
      console.error('Error setting badge count:', error);
    }
  }

  // Get current badge count
  async getBadgeCount(): Promise<number> {
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('Error getting badge count:', error);
      return 0;
    }
  }

  // Register for push notifications
  async registerForPushNotifications(): Promise<string | null> {
    if (!Device.isDevice) {
      console.log('Must use physical device for Push Notifications');
      return null;
    }

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return null;
      }

      const token = (await Notifications.getExpoPushTokenAsync()).data;
      console.log('Expo Push Token:', token);
      this.token = token;

      // Save token to Firebase
      await this.saveTokenToFirebase(token);

      return token;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      return null;
    }
  }

  // Save token to Firebase
  private async saveTokenToFirebase(token: string): Promise<void> {
    try {
      const user = getAuth().currentUser;
      if (!user) return;

      const tokenRef = ref(database, `users/${user.uid}/pushToken`);
      await set(tokenRef, {
        token: token,
        platform: Platform.OS,
        createdAt: Date.now(),
      });

      console.log('Push token saved to Firebase');
    } catch (error) {
      console.error('Error saving push token to Firebase:', error);
    }
  }

  // Setup notification listeners
  setupNotificationListeners(): () => void {
    // Listen for notifications received while app is foregrounded
    const foregroundSubscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received in foreground:', notification);
      
      // Automatically add to local storage when received
      if (notification.request.content.data) {
        this.addNotification(notification.request.content.data);
      }
    });

    // Listen for notification responses
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      this.handleNotificationResponse(response);
    });

    return () => {
      foregroundSubscription.remove();
      responseSubscription.remove();
    };
  }

  // Handle notification tap
  private handleNotificationResponse(response: Notifications.NotificationResponse): void {
    const data = response.notification.request.content.data;
    
    // Add to local storage when tapped
    this.addNotification(data);
    
    // Handle different notification types
    if (data.type === 'pickup_reminder') {
      console.log('Pickup reminder tapped - student:', data.studentName);
    } else if (data.type === 'attendance_update') {
      console.log('Attendance update tapped');
    } else if (data.type === 'manual_pickup_confirmation') {
      console.log('Manual pickup confirmation tapped');
    } else if (data.type === 'test') {
      console.log('Test notification tapped');
    }
  }

  // Schedule local notification - FIXED VERSION
  async scheduleLocalNotification(title: string, body: string, data: any = {}): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: 'default',
        },
        trigger: null, // Immediate notification
      });
      console.log('✅ Local notification scheduled:', title);
      
      // Also add to local storage
      await this.addNotification({ title, body, ...data });
    } catch (error) {
      console.error('Error scheduling local notification:', error);
    }
  }

  // Alternative method for delayed notifications
  async scheduleDelayedNotification(title: string, body: string, seconds: number, data: any = {}): Promise<void> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data,
          sound: 'default',
        },
        trigger: {
          type: 'timeInterval',
          seconds: seconds,
        } as Notifications.TimeIntervalTriggerInput,
      });
      console.log(`✅ Delayed notification scheduled for ${seconds} seconds:`, title);
    } catch (error) {
      console.error('Error scheduling delayed notification:', error);
    }
  }

  // Get notification by ID
  async getNotificationById(id: string): Promise<any | null> {
    return this.notifications.find(notification => notification.id === id) || null;
  }

  // Remove notification by ID
  async removeNotification(id: string): Promise<void> {
    try {
      this.notifications = this.notifications.filter(notification => notification.id !== id);
      await this.saveNotifications();
    } catch (error) {
      console.error('Error removing notification:', error);
    }
  }

  // Get notifications by type
  async getNotificationsByType(type: string): Promise<any[]> {
    return this.notifications.filter(notification => 
      notification.data?.type === type
    );
  }

  // Update badge count based on unread notifications
  async updateBadgeCount(): Promise<void> {
    try {
      const unreadCount = await this.getUnreadCount();
      await this.setBadgeCount(unreadCount);
    } catch (error) {
      console.error('Error updating badge count:', error);
    }
  }

  getToken(): string | null {
    return this.token;
  }

  // Get notification statistics
  async getNotificationStats(): Promise<{
    total: number;
    unread: number;
    read: number;
  }> {
    const total = this.notifications.length;
    const unread = this.notifications.filter(n => !n.read).length;
    const read = total - unread;

    return { total, unread, read };
  }
}

// Export singleton instance
export const notificationService = PushNotificationService.getInstance();

// Test function for notifications - FIXED VERSION
export const testNotification = async (): Promise<void> => {
  try {
    const permission = await Notifications.getPermissionsAsync();
    
    if (!permission.granted) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Notification permission not granted');
        return;
      }
    }

    // Test immediate notification
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🎉 RFID Scanner Test",
        body: "Push notifications are working perfectly!",
        data: { type: "test", screen: "home" },
        sound: 'default',
      },
      trigger: null, // Immediate
    });

    console.log('✅ Test notification scheduled successfully');
  } catch (error) {
    console.error('Error testing notification:', error);
  }
};

// Test function for delayed notification
export const testDelayedNotification = async (seconds: number = 5): Promise<void> => {
  try {
    const permission = await Notifications.getPermissionsAsync();
    
    if (!permission.granted) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('Notification permission not granted');
        return;
      }
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "⏰ Delayed Test",
        body: `This notification was delayed by ${seconds} seconds`,
        data: { type: "delayed_test", screen: "home" },
        sound: 'default',
      },
      trigger: {
        type: 'timeInterval',
        seconds: seconds,
      } as Notifications.TimeIntervalTriggerInput,
    });

    console.log(`✅ Delayed test notification scheduled for ${seconds} seconds`);
  } catch (error) {
    console.error('Error testing delayed notification:', error);
  }
};

// Test function for local notification storage
export const testLocalNotificationStorage = async (): Promise<void> => {
  try {
    const service = PushNotificationService.getInstance();
    
    // Add test notification
    await service.addNotification({
      title: "📱 Local Storage Test",
      body: "This notification is stored locally",
      type: "storage_test",
      testData: { value: 123, timestamp: Date.now() }
    });

    // Get all notifications
    const notifications = await service.getAllNotifications();
    console.log('Local notifications:', notifications);

    // Get unread count
    const unreadCount = await service.getUnreadCount();
    console.log('Unread notifications:', unreadCount);

    // Update badge count
    await service.updateBadgeCount();

    console.log('✅ Local notification storage test completed');
  } catch (error) {
    console.error('Error testing local notification storage:', error);
  }
};