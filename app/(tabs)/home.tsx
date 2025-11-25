import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { get, off, onValue, ref, remove, update } from 'firebase/database';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { auth, database } from '../../firebaseConfig';

// Add Expo Notifications
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

// Configure Notifications for background handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// --- ENHANCED DESIGN SYSTEM CONSTANTS ---
const COLORS = {
  primary: '#1999e8',
  primaryDark: '#1488d0',
  primaryLight: '#2da8f0',
  primaryGradient: ['#1999e8', '#1488d0'] as const,
  
  success: '#10b981',
  successLight: '#d1fae5',
  successDark: '#059669',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  warningDark: '#d97706',
  error: '#ef4444',
  errorLight: '#fee2e2',
  errorDark: '#dc2626',
  info: '#06b6d4',
  infoLight: '#cffafe',
  infoDark: '#0891b2',
  
  white: '#ffffff',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',
  
  background: '#f8fafc',
  card: '#ffffff',
  cardDark: '#f8fafc',
};

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

const TYPOGRAPHY = {
  xs: { fontSize: 12, lineHeight: 16, fontFamily: 'System' },
  sm: { fontSize: 14, lineHeight: 20, fontFamily: 'System' },
  base: { fontSize: 16, lineHeight: 24, fontFamily: 'System' },
  lg: { fontSize: 18, lineHeight: 28, fontFamily: 'System' },
  xl: { fontSize: 20, lineHeight: 28, fontFamily: 'System' },
  '2xl': { fontSize: 24, lineHeight: 32, fontFamily: 'System' },
  '3xl': { fontSize: 30, lineHeight: 36, fontFamily: 'System' },
};

const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 999,
};

const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
};

// Interfaces
interface HomeScreenProps {
  searchParams?: {
    childData?: string;
  };
}

interface AttendanceRecord {
  status: string;
  timeIn: string;
  timeOut?: string;
  grade?: string;
  studentName?: string;
  notifIn?: boolean;
  timestamp?: number;
}

interface ManualPickupConfirmation {
  confirmed: boolean;
  confirmationTime: number;
  reason?: string;
  notes?: string;
  requiresAdminVerification?: boolean;
  adminVerified?: boolean;
  adminVerificationTime?: number;
  confirmedViaNotification?: boolean;
}

interface PickupRecord {
  parentName: string;
  status: string;
  timeOut: number;
  parentRfid?: string;
  reminderSent?: boolean;
  manualConfirmation?: ManualPickupConfirmation;
}

interface Guardian {
  userId?: string;
  name: string;
  email: string;
  contact: string;
  address: string;
  rfid: string;
  relationship?: string;
}

interface Student {
  id: string;
  firstName: string;
  middleName?: string;
  lastName?: string;
  gradeLevel: string;
  section?: string;
  photo?: string;
  photoBase64?: string;
  guardians?: Guardian[];
  attendance?: number;
  absences?: number;
  lates?: number;
  rfid?: string;
}

interface ParentInfo {
  firstName?: string;
  photoBase64?: string;
  userId?: string;
  email?: string;
}

interface MonthlyStats {
  present: number;
  late: number;
  absent: number;
  totalDays: number;
  attendancePercentage: number;
}

interface Activity {
  type: 'attendance' | 'pickup' | 'reminder';
  message: string;
  timestamp: number;
  studentName: string;
  id: string;
  notificationId?: string;
  processed?: boolean;
}

interface ParentNotification {
  type: string;
  studentRfid: string;
  studentName: string;
  action: string;
  status: string;
  time: string;
  timestamp: number;
  read: boolean;
}

// --- HOME SCREEN COMPONENT ---
const HomeScreen: React.FC<HomeScreenProps> = ({ searchParams }) => {
  const router = useRouter();
  const childData = searchParams?.childData;
  const [student, setStudent] = useState<Student | null>(null);
  const [parentInfo, setParentInfo] = useState<ParentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [pickupData, setPickupData] = useState<PickupRecord | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats>({
    present: 0,
    late: 0,
    absent: 0,
    totalDays: 0,
    attendancePercentage: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showChildDetails, setShowChildDetails] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  
  // Use refs to track reminder state without causing re-renders
  // Ref to ensure 'notid' notification only shows once per day
  const hasShownNotidRef = useRef<{ [date: string]: boolean }>({});
  const reminderAlertShownRef = useRef(false);
  const lastReminderCheckRef = useRef<number>(0);
  const processedActivitiesRef = useRef<Set<string>>(new Set());
  const processedNotificationsRef = useRef<Set<string>>(new Set());
  const listenersSetupRef = useRef(false);
  const dataLoadedRef = useRef(false);
  const lastNotificationCheckRef = useRef<number>(0);
  const dailyReminderCheckRef = useRef<boolean>(false);
  
  const backgroundTaskRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduled1230ReminderRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduledHourlyRemindersRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const notificationListener = useRef<Notifications.EventSubscription | null>(null);
  const responseListener = useRef<Notifications.EventSubscription | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  // ==================== AUTOMATIC REMINDER FUNCTIONS ====================
  const schedule1230To11PMReminders = useCallback((student: Student) => {
    console.log('🕒 Setting up 12:30 PM to 11:00 PM automatic reminders...');
    
    const checkAndSendAutomaticReminder = async () => {
      try {
        const now = new Date();
        const currentTime = now.getHours() * 100 + now.getMinutes();
        
        // Check if current time is between 12:30 PM (1230) and 5:00 PM (1700)
        const isWithinTimeRange = currentTime >= 1230 && currentTime <= 1700;
        
        console.log('🕒 Automatic Reminder Check:', {
          currentTime,
          isWithinTimeRange,
          currentHour: now.getHours(),
          currentMinute: now.getMinutes(),
          timeWindow: '12:30 PM - 5:00 PM'
        });
        
        if (isWithinTimeRange) {
          const today = new Date();
          const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          const pickupRef = ref(database, `pickups/${todayDate}/${student.rfid}`);
          
          const pickupSnap = await get(pickupRef);
          const currentPickup = pickupSnap.exists() ? pickupSnap.val() : null;
          
          // Check if manual pickup was confirmed and approved by admin
          const hasApprovedManualPickup = currentPickup?.manualConfirmation?.confirmed && 
                                          currentPickup?.manualConfirmation?.adminVerified;
          
          // Check if student hasn't been picked up yet
          if (currentPickup && 
              currentPickup.status === 'Waiting' && 
              !currentPickup.parentRfid &&
              !hasApprovedManualPickup &&
              !dailyReminderCheckRef.current) {
            
            console.log('✅ AUTOMATIC REMINDER: Student not picked up - SENDING NOTIFICATION WITH ACTION BUTTONS');
            
            const studentFullName = `${student.firstName} ${student.lastName || ''}`.trim();
            const guardianName = getGuardianName();
            
            // Send notification with action buttons that work even when app is closed
            await sendPushNotification(
              '🎒 Pickup Confirmation Needed',
              `Did you forget to scan your RFID when picking up ${studentFullName}? If you already have ${student.firstName} with you, please confirm pickup.`,
              {
                type: 'forgot_scan_reminder',
                studentId: student.id,
                studentRfid: student.rfid,
                studentName: studentFullName,
                parentName: guardianName,
                action: 'confirm_pickup',
                timestamp: Date.now(),
                urgent: true,
                requiresResponse: true,
                pickupDate: todayDate
              },
              true,
              'PICKUP_CONFIRMATION' // This triggers the action buttons
            );
            
            addRecentActivity({
              type: 'reminder',
              message: `📲 Pickup confirmation sent: ${guardianName}, please confirm if you have ${studentFullName}`,
              timestamp: Date.now(),
              studentName: studentFullName,
            });
            
            dailyReminderCheckRef.current = true;
            console.log('✅ FORGOT-TO-SCAN REMINDER WITH ACTION BUTTONS SENT');
          } else {
            console.log('❌ Automatic reminder conditions not met:', {
              hasPickupRecord: !!currentPickup,
              status: currentPickup?.status,
              hasParentRfid: !!currentPickup?.parentRfid,
              hasApprovedManualPickup: currentPickup?.manualConfirmation?.confirmed && currentPickup?.manualConfirmation?.adminVerified,
              reminderAlreadySent: dailyReminderCheckRef.current
            });
          }
        } else {
          // Reset the daily reminder flag when outside the time range
          if (currentTime > 1700 || currentTime < 1230) {
            dailyReminderCheckRef.current = false;
            console.log('🔄 Daily reminder flag reset - outside time range (12:30 PM - 5:00 PM)');
          }
        }
        
        // Schedule next check in 1 minute
        setTimeout(() => checkAndSendAutomaticReminder(), 60 * 1000);
        
      } catch (error) {
        console.error('❌ Automatic reminder error:', error);
        // Retry after 1 minute on error
        setTimeout(() => checkAndSendAutomaticReminder(), 60 * 1000);
      }
    };
    
    // Calculate time until next 12:30 PM
    const now = new Date();
    const next1230 = new Date();
    next1230.setHours(12, 30, 0, 0);
    
    // If it's already past 12:30 today, schedule for tomorrow
    if (now > next1230) {
      next1230.setDate(next1230.getDate() + 1);
    }
    
    const timeUntil1230 = next1230.getTime() - now.getTime();
    
    console.log('⏰ Next 12:30 PM reminder scheduled in:', {
      hours: Math.floor(timeUntil1230 / (1000 * 60 * 60)),
      minutes: Math.floor((timeUntil1230 % (1000 * 60 * 60)) / (1000 * 60))
    });
    
    // Schedule the first check at 12:30 PM
    scheduled1230ReminderRef.current = setTimeout(() => {
      console.log('🕒 12:30 PM - Starting automatic reminders');
      checkAndSendAutomaticReminder();
    }, timeUntil1230);
    
  }, [student]); // Removed circular dependencies

  const scheduleHourlyReminders = useCallback((student: Student) => {
    console.log('⏰ Setting up hourly reminders from 12:30 PM to 11:00 PM...');
    
    const sendHourlyReminder = async () => {
      try {
        const now = new Date();
        const currentTime = now.getHours() * 100 + now.getMinutes();
        const currentHour = now.getHours();
        
        // Check if current time is between 12:30 PM and 11:00 PM
        const isWithinTimeRange = currentTime >= 1230 && currentTime <= 2300;
        
        console.log('⏰ Hourly Reminder Check:', {
          currentTime,
          currentHour,
          isWithinTimeRange
        });
        
        if (isWithinTimeRange) {
          const today = new Date();
          const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          const pickupRef = ref(database, `pickups/${todayDate}/${student.rfid}`);
          
          const pickupSnap = await get(pickupRef);
          const currentPickup = pickupSnap.exists() ? pickupSnap.val() : null;
          
          // Check if manual pickup was confirmed and approved by admin
          const hasApprovedManualPickup = currentPickup?.manualConfirmation?.confirmed && 
                                          currentPickup?.manualConfirmation?.adminVerified;
          
          // Check if student hasn't been picked up yet
          if (currentPickup && 
              currentPickup.status === 'Waiting' && 
              !currentPickup.parentRfid &&
              !hasApprovedManualPickup) {
            
            console.log('✅ HOURLY REMINDER: Student not picked up - SENDING REMINDER');
            
            const studentFullName = `${student.firstName} ${student.lastName || ''}`.trim();
            const timeText = currentHour < 12 ? `${currentHour} AM` : 
                            currentHour === 12 ? '12 PM' : 
                            `${currentHour - 12} PM`;
            
            await sendPushNotification(
              `🔔 ${timeText} Pickup Reminder`,
              `Reminder: ${studentFullName} is still waiting for pickup. Please scan your RFID or confirm manual pickup.`,
              {
                type: 'hourly_pickup_reminder',
                studentId: student.id,
                studentName: studentFullName,
                action: 'show_confirmation',
                timestamp: Date.now(),
                urgent: true,
                requiresResponse: true,
                hour: currentHour
              },
              true,
              'PICKUP_CONFIRMATION'
            );
            
            addRecentActivity({
              type: 'reminder',
              message: `Hourly reminder sent at ${timeText} for ${studentFullName}`,
              timestamp: Date.now(),
              studentName: studentFullName,
            });
            
            console.log(`✅ HOURLY REMINDER SENT for ${timeText}`);
          }
        }
        
        // Schedule next check in 1 hour
        const nextCheck = 60 * 60 * 1000; // 1 hour
        scheduledHourlyRemindersRef.current = setTimeout(sendHourlyReminder, nextCheck);
        
      } catch (error) {
        console.error('❌ Hourly reminder error:', error);
        // Retry after 5 minutes on error
        scheduledHourlyRemindersRef.current = setTimeout(sendHourlyReminder, 5 * 60 * 1000);
      }
    };
    
    // Start the hourly reminders
    sendHourlyReminder();
    
  }, [student]); // Removed circular dependencies

  // ==================== TROUBLESHOOTING FUNCTIONS ====================
  const testSimpleNotification = useCallback(async () => {
    try {
      console.log('🧪 Testing basic notification...');
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🧪 Test Notification',
          body: 'If you can see this, notifications are working!',
          sound: true,
          data: { type: 'test' },
        },
        trigger: null,
      });
      
      Alert.alert(
        'Test Sent',
        'Basic notification test sent. You should see a notification immediately.',
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      console.error('❌ Basic test failed:', error);
      Alert.alert('Test Failed', 'Could not send test notification');
    }
  }, []);

  const testAutomaticReminder = useCallback(async () => {
    if (!student) return;
    
    try {
      console.log('🧪 Testing automatic reminder system...');
      
      // Simulate the automatic reminder
      const studentFullName = `${student.firstName} ${student.lastName || ''}`.trim();
      
      // Function will be available at runtime
      await (sendPushNotification as any)(
        '🧪 Test Automatic Reminder',
        `This is a test of the automatic reminder system for ${studentFullName}. The real reminders will run from 12:30 PM to 11:00 PM daily.`,
        {
          type: 'test_automatic_reminder',
          studentId: student.id,
          studentName: studentFullName,
          action: 'test',
          timestamp: Date.now(),
          urgent: false
        },
        false
      );
      
      Alert.alert(
        'Test Sent',
        'Automatic reminder test sent. Real reminders will run from 12:30 PM to 11:00 PM daily.',
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      console.error('❌ Automatic reminder test failed:', error);
      Alert.alert('Test Failed', 'Could not send automatic reminder test');
    }
  }, [student]); // Removed circular dependency

  const testPickupReminderWithButtons = useCallback(async () => {
    if (!student) {
      Alert.alert('Error', 'No student data available');
      return;
    }
    
    try {
      console.log('🧪 Testing pickup reminder WITH ACTION BUTTONS...');
      
      const studentFullName = `${student.firstName} ${student.lastName || ''}`.trim();
      
      // Send notification with PICKUP_CONFIRMATION category (has action buttons)
      // Use unique type to avoid duplicate detection
      await sendPushNotification(
        '🔔 PICKUP REMINDER TEST',
        `Did you pick up ${studentFullName}? Tap a button to confirm!`,
        {
          type: 'test_reminder_with_buttons', // Unique type for testing
          studentId: student.id,
          studentName: studentFullName,
          action: 'test_with_buttons',
          timestamp: Date.now(),
          urgent: true,
          testMode: true // Flag to skip duplicate check
        },
        true, // isUrgent
        'PICKUP_CONFIRMATION' // This adds the action buttons!
      );
      
      Alert.alert(
        '✅ Test Sent!',
        'Check your notification! You should see:\n\n✅ Yes, Picked Up\n❌ Not Yet\n\nButtons work even when app is CLOSED!',
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      console.error('❌ Test failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Could not send test notification';
      Alert.alert('Test Failed', errorMessage);
    }
  }, [student]);

  const checkNotificationPermissions = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    console.log('Notification permission status:', status);
    Alert.alert('Permissions', `Notification status: ${status}`);
    
    if (status !== 'granted') {
      Alert.alert(
        'Permissions Needed',
        'Please enable notifications in app settings',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
    }
  };

  const simulatePickupWaiting = useCallback(async () => {
    if (!student) return;
    
    try {
      const today = new Date();
      const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const pickupRef = ref(database, `pickups/${todayDate}/${student.rfid}`);
      
      // Create a waiting pickup record
      await update(pickupRef, {
        status: "Waiting",
        parentName: "Test Parent",
        timeOut: Date.now(),
        reminderSent: false
      });
      
      Alert.alert(
        'Simulation Created',
        'Waiting pickup record created. Alerts should start in 30 seconds.',
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      console.error('Error creating simulation:', error);
      Alert.alert('Error', 'Failed to create test pickup record');
    }
  }, [student]);

  const forceImmediateAlert = useCallback(async () => {
    if (!student) return;
    
    try {
      console.log('🚨 FORCING IMMEDIATE ALERT');
      
      const today = new Date();
      const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const pickupRef = ref(database, `pickups/${todayDate}/${student.rfid}`);
      
      const pickupSnap = await get(pickupRef);
      const currentPickup = pickupSnap.exists() ? pickupSnap.val() : null;
      
      await checkAndSendRFIDReminder(student, currentPickup);
      
      Alert.alert(
        'Alert Forced',
        'Pickup alert should appear immediately.',
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      console.error('Force alert failed:', error);
      Alert.alert('Error', 'Failed to force alert');
    }
  }, [student]);

  const clearAllPickupData = useCallback(async () => {
    if (!student) return;
    
    try {
      const today = new Date();
      const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const pickupRef = ref(database, `pickups/${todayDate}/${student.rfid}`);
      
      await remove(pickupRef); // Delete pickup data
      
      Alert.alert(
        'Data Cleared',
        'Pickup data cleared. You can now test from scratch.',
        [{ text: 'OK' }]
      );
      
    } catch (error) {
      console.error('Error clearing data:', error);
      Alert.alert('Error', 'Failed to clear pickup data');
    }
  }, [student]);

  // ==================== NOTIFICATION FUNCTIONS ====================
  const registerForPushNotificationsAsync = useCallback(async () => {
    if (!Device.isDevice) {
      console.log('Must use physical device for Push Notifications');
      return;
    }

    try {
      console.log('🔔 Starting push notification registration...');

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        console.log('Requesting notification permissions...');
        
        const { status } = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowCriticalAlerts: true,
          },
          android: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
        finalStatus = status;
        console.log('Notification permission status:', finalStatus);
      }

      if (finalStatus !== 'granted') {
        console.log('❌ Notification permission not granted');
        Alert.alert(
          'Notifications Disabled',
          'Please enable notifications in your device settings to receive important pickup alerts about your child.',
          [{ text: 'OK' }]
        );
        return;
      }

      console.log('✅ Notification permission granted');

      if (Platform.OS === 'ios') {
        const { status: criticalStatus } = await Notifications.requestPermissionsAsync({
          ios: {
            allowCriticalAlerts: true,
          },
        });
        console.log('Critical alerts permission:', criticalStatus);
      }

      try {
        const token = (await Notifications.getExpoPushTokenAsync()).data;
        console.log('📱 Expo Push Token:', token);
        
        if (user) {
          // Store token in standardized format for notification service
          const pushTokenData = {
            token: token,
            platform: Platform.OS,
            deviceId: Device.modelName || 'unknown',
            createdAt: Date.now(),
            updatedAt: Date.now()
          };

          // Primary location - used by notification service
          const userPushTokenRef = ref(database, `users/${user.uid}/pushToken`);
          await update(userPushTokenRef, pushTokenData);
          
          // Backup location for compatibility
          const expoPushTokenRef = ref(database, `users/${user.uid}/expoPushToken`);
          await update(expoPushTokenRef, pushTokenData);
          
          // Also store in parents collection if exists
          const parentsRef = ref(database, `parents/${user.uid}`);
          await update(parentsRef, { 
            fcmToken: token,
            expoPushToken: token,
            pushToken: token,
            lastTokenUpdate: Date.now()
          });
          
          console.log('✅ Push token saved to Firebase in multiple locations');
          console.log('   - users/${uid}/pushToken (primary)');
          console.log('   - users/${uid}/expoPushToken (backup)');
          console.log('   - parents/${uid} (legacy)');
        }
      } catch (tokenError) {
        console.warn('⚠️ Expo push token error:', tokenError);
        // Silently continue - app works without push notifications
      }

      if (Platform.OS === 'android') {
        console.log('Setting up Android notification channels...');
        
        await Notifications.setNotificationChannelAsync('pickup-alerts', {
          name: 'Pickup Alerts',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 1000, 500, 1000, 500, 1000],
          lightColor: '#FF231F7C',
          sound: 'default',
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          showBadge: true,
          enableLights: true,
          enableVibrate: true,
        });

        await Notifications.setNotificationChannelAsync('urgent', {
          name: 'Urgent Alerts',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 1000, 500, 1000],
          lightColor: '#FF0000',
          sound: 'default',
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          showBadge: true,
          enableLights: true,
          enableVibrate: true,
        });
      }

      // Setup notification categories for both iOS and Android
      console.log('Setting up notification categories with action buttons...');
      
      await Notifications.setNotificationCategoryAsync('PICKUP_CONFIRMATION', [
        {
          identifier: 'NOT_YET',
          buttonTitle: 'Not Yet',
          options: {
            opensAppToForeground: false,
          },
        },
        {
          identifier: 'CONFIRM_PICKUP',
          buttonTitle: '✅ Yes, Picked Up',
          options: {
            opensAppToForeground: true,
          },
        },
      ]);

      console.log('✅ Push notifications configured for background pickup alerts');

    } catch (error) {
      console.error('❌ Error configuring push notifications:', error);
    }
  }, [user]);

  async function sendPushNotification(title: string, body: string, data: any = {}, isUrgent: boolean = false, category: string = 'default') {
    try {
      console.log('🔔 Sending notification:', title);

      const notificationId = `${data.type}-${data.studentId}-${Date.now()}`;
      data.notificationId = notificationId;

      if (processedNotificationsRef.current.has(notificationId)) {
        console.log('🔄 Notification already processed, skipping:', notificationId);
        return null;
      }

      let channelId = 'default';
      if (Platform.OS === 'android') {
        channelId = isUrgent ? 'pickup-alerts' : 'background-reminders';
      }
      
      const interruptionLevel = isUrgent ? 'critical' : 'active';

      const scheduledNotificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: title,
          body: body,
          data: data,
          sound: true,
          badge: data.badge || 1,
          ...(Platform.OS === 'ios' && {
            interruptionLevel: interruptionLevel,
            categoryIdentifier: category,
          }),
          ...(Platform.OS === 'android' && {
            channelId: channelId,
            vibrate: isUrgent ? [0, 1000, 500, 1000] : [0, 250, 250, 250],
            priority: isUrgent ? 'high' : 'default',
          }),
        },
        trigger: null,
      });

      processedNotificationsRef.current.add(notificationId);
      
      if (processedNotificationsRef.current.size > 100) {
        const array = Array.from(processedNotificationsRef.current);
        processedNotificationsRef.current = new Set(array.slice(-50));
      }

      console.log('✅ Notification sent successfully', { 
        notificationId: scheduledNotificationId,
        uniqueId: notificationId
      });
      
      return scheduledNotificationId;

    } catch (error) {
      console.error('❌ Error sending notification:', error);
      throw error;
    }
  }

  const showSimplePickupConfirmation = useCallback(async (student: Student, isAutomaticReminder: boolean = false) => {
    const studentFullName = `${student.firstName} ${student.lastName || ''}`.trim();
    
    try {
      const title = isAutomaticReminder 
        ? '🔔 Daily Pickup Reminder' 
        : '🔔 Forgot to Scan RFID?';
      
      const body = isAutomaticReminder
        ? `Good afternoon! Don't forget to scan your RFID when picking up ${studentFullName}. Tap to confirm if already picked up.`
        : `Have you picked up ${studentFullName} but forgot to scan your RFID card? Tap to confirm manual pickup.`;

      await sendPushNotification(
        title,
        body,
        {
          type: isAutomaticReminder ? 'daily_reminder_1230_2100' : 'pickup_reminder_alert',
          studentId: student.id,
          studentName: studentFullName,
          action: 'show_confirmation',
          timestamp: Date.now(),
          urgent: true,
          requiresResponse: true
        },
        true,
        'PICKUP_CONFIRMATION'
      );

      console.log('✅ INTERACTIVE PICKUP ALERT SENT');

      addRecentActivity({
        type: 'reminder',
        message: `Reminder sent: Please scan RFID or confirm manual pickup for ${studentFullName}`,
        timestamp: Date.now(),
        studentName: studentFullName,
      });

    } catch (error) {
      console.error('❌ Error sending pickup alert notification:', error);
    }
  }, [sendPushNotification]);

  const handleNotificationResponse = useCallback(async (response: Notifications.NotificationResponse) => {
    console.log('👆 Notification response received:', response);
    const data = response.notification.request.content.data as any;
    const actionIdentifier = response.actionIdentifier;
    
    if (data.notificationId) {
      processedNotificationsRef.current.add(data.notificationId as string);
    }
    
    if (actionIdentifier === 'CONFIRM_PICKUP' || actionIdentifier === 'CONFIRM_PICKUP_REMINDER') {
      console.log('✅ User confirmed pickup via notification action button');
      
      // Process the manual pickup confirmation
      if (student && data.studentRfid) {
        try {
          const studentFullName = `${student.firstName} ${student.lastName || ''}`.trim();
          const guardianName = getGuardianName();
          const today = new Date();
          const todayDate = data.pickupDate || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
          const pickupRef = ref(database, `pickups/${todayDate}/${data.studentRfid}`);
          
          console.log('📝 Recording manual pickup confirmation...');
          
          const manualConfirmation: ManualPickupConfirmation = {
            confirmed: true,
            confirmationTime: Date.now(),
            reason: 'forgot_rfid_card',
            notes: 'Parent confirmed via notification - forgot to scan RFID at pickup',
            requiresAdminVerification: true,
            confirmedViaNotification: true
          };
          
          // Update pickup record with pending verification status
          await update(pickupRef, {
            status: "Pending Verification",
            parentName: guardianName,
            parentRfid: "manual_confirmation_pending",
            timeOut: Date.now(),
            manualConfirmation: manualConfirmation,
            reminderSent: true
          });
          
          // Notify admin about manual pickup that needs verification
          await notifyAdminManualPickup(student, manualConfirmation);
          
          // Send confirmation to parent
          await sendPushNotification(
            '⏳ Pickup Confirmation Received',
            `Thank you! Your pickup confirmation for ${studentFullName} is pending admin verification. You will be notified once approved.`,
            {
              type: 'pickup_confirmation_received',
              studentId: student.id,
              studentName: studentFullName,
              status: 'pending_verification',
              timestamp: Date.now(),
            }
          );
          
          addRecentActivity({
            type: 'pickup',
            message: `✅ PICKUP CONFIRMED: ${guardianName} confirmed pickup of ${studentFullName} (pending admin approval)`,
            timestamp: Date.now(),
            studentName: studentFullName,
          });
          
          reminderAlertShownRef.current = true;
          dailyReminderCheckRef.current = true;
          
          console.log('✅ Manual pickup confirmation recorded - waiting for admin approval');
          
        } catch (error) {
          console.error('❌ Error processing manual pickup confirmation:', error);
          await sendPushNotification(
            '❌ Error',
            'Failed to record pickup confirmation. Please try again or contact the school.',
            {
              type: 'error',
              timestamp: Date.now(),
            }
          );
        }
      }
    } 
    else if (actionIdentifier === 'NOT_YET' || actionIdentifier === 'NOT_YET_REMINDER') {
      console.log('❌ User said not picked up yet');
      reminderAlertShownRef.current = false;
      dailyReminderCheckRef.current = false;
      
      await sendPushNotification(
        'ℹ️ Reminder Dismissed',
        'Okay! We\'ll remind you again later. Please remember to scan your RFID when you pick up your child.',
        {
          type: 'reminder_dismissed',
          timestamp: Date.now(),
        }
      );
      
      // Reset flag after 30 minutes to allow another reminder
      setTimeout(() => {
        reminderAlertShownRef.current = false;
        dailyReminderCheckRef.current = false;
        console.log('🔄 Reset reminder flag after "Not Yet" response');
      }, 30 * 60 * 1000);
    }
    else if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      console.log('📱 User tapped notification body');
      
      // Check if it's a teacher message notification
      if (data.type === 'teacher_message') {
        console.log('💬 Teacher message notification tapped - navigating to messages');
        
        // Navigate directly to messages screen without showing alert
        setTimeout(() => {
          router.push('/message');
        }, 300);
        
        return; // Exit early to avoid showing alert
      }
      
      // Show alert for other notification types
      const title = response.notification.request.content.title || 'Notification';
      const body = response.notification.request.content.body || '';
      
      setTimeout(() => {
        Alert.alert(
          title,
          body,
          [
            {
              text: 'OK',
              style: 'default'
            }
          ]
        );
      }, 500);
      
      if (data.type === 'reminder' || data.type === 'pickup_reminder_alert' || data.type === 'daily_reminder_1230_2100') {
        if (student) {
          setTimeout(() => {
            confirmManualPickup(student);
          }, 1000);
        }
      }
    }
  }, [student]);

  // ==================== ENHANCED PICKUP ALERT SYSTEM ====================
  const checkAndSendRFIDReminder = useCallback(async (student: Student, pickupRecord: PickupRecord | null) => {
    try {
      const now = new Date();
      const currentTime = now.getHours() * 100 + now.getMinutes();
      const currentTimestamp = Date.now();
      const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      console.log(`🕒 Regular Reminder Check:`, {
        currentTime,
        pickupStatus: pickupRecord?.status,
        parentRfid: pickupRecord?.parentRfid,
      });

      lastReminderCheckRef.current = currentTimestamp;

      // Only show 'notid' notification once per day
      if (
        pickupRecord &&
        pickupRecord.status === 'Waiting' &&
        !pickupRecord.parentRfid &&
        !hasShownNotidRef.current[todayDate]
      ) {
        console.log('✅ CONDITIONS MET: Showing RFID reminder notification (notid)');
        await showSimplePickupConfirmation(student, false);
        hasShownNotidRef.current[todayDate] = true;
        console.log('✅ RFID scan reminder sent (notid)');
      } else {
        console.log('❌ Conditions not met or already shown today:', {
          hasPickupRecord: !!pickupRecord,
          status: pickupRecord?.status,
          hasParentRfid: !!pickupRecord?.parentRfid,
          alreadyShown: hasShownNotidRef.current[todayDate]
        });
      }
    } catch (error) {
      console.error('Error in RFID reminder check:', error);
    }
  }, [showSimplePickupConfirmation]);

  // ==================== ENHANCED BACKGROUND TASK ====================
  const setupBackgroundTask = useCallback((student: Student) => {
    console.log('🔄 Setting up background task for automatic reminders...');
    
    if (backgroundTaskRef.current) {
      clearTimeout(backgroundTaskRef.current);
    }
    
    backgroundTaskRef.current = setTimeout(async () => {
      try {
        const now = new Date();
        const currentTime = now.getHours() * 100 + now.getMinutes();
        
        console.log('🕒 Background Task Running:', {
          currentTime,
          appState: 'BACKGROUND/CLOSED'
        });
      
        console.log('✅ Background Task: Checking pickup status');
        
        const today = new Date();
        const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const pickupRef = ref(database, `pickups/${todayDate}/${student.rfid}`);
        
        const pickupSnap = await get(pickupRef);
        const currentPickup = pickupSnap.exists() ? pickupSnap.val() : null;
        
        if (currentPickup && 
            currentPickup.status === 'Waiting' && 
            !currentPickup.parentRfid) {
          
          console.log('✅ BACKGROUND TASK: Student not picked up - SENDING PICKUP ALERT');
          
          await sendPushNotification(
            '🔔 Pickup Reminder',
            `Reminder: ${student.firstName} is waiting for pickup. Please scan your RFID or confirm manual pickup.`,
            {
              type: 'background_pickup_alert',
              studentId: student.id,
              studentName: `${student.firstName} ${student.lastName || ''}`,
              action: 'show_confirmation',
              timestamp: Date.now(),
              urgent: true
            },
            true,
            'PICKUP_CONFIRMATION'
          );
          
          console.log('✅ BACKGROUND PICKUP ALERT SENT');
        }
        
        await checkAndSendRFIDReminder(student, currentPickup);
        
        setupBackgroundTask(student);
      } catch (error) {
        console.error('❌ Background task error:', error);
        setupBackgroundTask(student);
      }
    }, 30 * 1000);
    
    console.log('✅ Background task setup complete');
  }, [checkAndSendRFIDReminder, sendPushNotification]);

  // ==================== NOTIFICATION SETUP ====================
  useEffect(() => {
    console.log('🔔 Setting up notification system for background alerts...');

    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        console.log('📱 Notification received in handler:', notification.request.content.title);
        
        const data = notification.request.content.data as any;
        
        // Skip duplicate check for test notifications
        if (data.notificationId && processedNotificationsRef.current.has(data.notificationId as string)) {
          // Allow test notifications to pass through
          if (!data.testMode) {
            console.log('🔄 Notification already processed, not showing again:', data.notificationId);
            return {
              shouldShowAlert: false,
              shouldPlaySound: false,
              shouldSetBadge: false,
              shouldShowBanner: false,
              shouldShowList: false,
            };
          } else {
            console.log('🧪 Test notification - allowing duplicate');
          }
        }
        
        if (typeof data.type === 'string' && (data.type.includes('pickup') || data.type.includes('reminder'))) {
          console.log('🚨 PICKUP ALERT - Showing even in background');
          return {
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
          };
        }
        
        return {
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        };
      },
    });

    registerForPushNotificationsAsync();

    Notifications.getLastNotificationResponseAsync()
      .then(response => {
        if (response?.notification) {
          console.log('App opened from notification:', response.notification);
          handleNotificationResponse(response);
        }
      });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('📱 Notification received in foreground:', notification.request.content.title);
      
      const data = notification.request.content.data as any;
      
      // Check if data exists before accessing notificationId
      if (data && data.notificationId) {
        processedNotificationsRef.current.add(data.notificationId as string);
      }
      
      if (data && (data.type === 'daily_reminder_1230_2100' || data.type === 'pickup_reminder_alert')) {
        console.log('🔄 Auto-processing pickup notification in foreground');
      }
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('👆 Notification response received:', response.notification.request.content.title);
      handleNotificationResponse(response);
    });

    return () => {
      console.log('🧹 Cleaning up notification listeners');
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [registerForPushNotificationsAsync, handleNotificationResponse]);

  // Auth state listener
  useEffect(() => {
    console.log('🔐 Setting up auth listener');
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('🔄 Auth state changed:', user ? user.email : 'No user');
      if (user) {
        setUser(user);
      } else {
        setUser(null);
        router.replace('/');
      }
    });

    return unsubscribe;
  }, []);

  // --- UTILITY FUNCTIONS ---
  const normalizeGuardians = useCallback((guardians: any): Guardian[] => {
    if (!guardians) return [];
    if (Array.isArray(guardians)) return guardians;
    return Object.values(guardians) as Guardian[];
  }, []);

  const findGuardianByEmail = useCallback((guardians: Guardian[], userEmail: string | null): Guardian | null => {
    if (!userEmail) return null;
    return guardians.find(guardian =>
      guardian.email.toLowerCase() === userEmail.toLowerCase()
    ) || null;
  }, []);

  const formatTime = useCallback((timeString: string) => {
    if (!timeString) return '--:--';
    try {
      if (timeString.includes(':')) {
        const [hours, minutes] = timeString.split(':');
        const hourNum = parseInt(hours);
        const period = hourNum >= 12 ? 'PM' : 'AM';
        const displayHour = hourNum % 12 || 12;
        return `${displayHour}:${minutes} ${period}`;
      }
      return timeString;
    } catch (error) {
      return timeString;
    }
  }, []);

  const formatDateTime = useCallback((timestamp: number) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }, []);

  const saveActivitiesToFirebase = useCallback(async (activities: Activity[]) => {
    try {
      if (!user) return;

      const activitiesRef = ref(database, `users/${user.uid}/recentActivities`);
      await update(activitiesRef, {
        activities: activities,
        lastUpdated: Date.now()
      });
      console.log('💾 Activities saved to Firebase:', activities.length);
    } catch (error) {
      console.error('Error saving activities to Firebase:', error);
    }
  }, [user]);

  const loadActivitiesFromFirebase = useCallback(async (): Promise<Activity[]> => {
    try {
      if (!user) return [];

      const activitiesRef = ref(database, `users/${user.uid}/recentActivities`);
      const snapshot = await get(activitiesRef);
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        console.log('📥 Loaded activities from Firebase:', data.activities?.length || 0);
        return data.activities || [];
      }
      return [];
    } catch (error) {
      console.error('Error loading activities from Firebase:', error);
      return [];
    }
  }, [user]);

  const addRecentActivity = useCallback((activity: Omit<Activity, 'id'>) => {
    const activityId = `${activity.type}-${activity.timestamp}-${activity.message.substring(0, 30).replace(/\s+/g, '_')}`;
    
    if (processedActivitiesRef.current.has(activityId)) {
      console.log('🔄 Activity already processed, skipping:', activityId);
      return;
    }

    setRecentActivities(prev => {
      const exists = prev.some(item => item.id === activityId);
      
      if (!exists) {
        const newActivity: Activity = { ...activity, id: activityId };
        const newActivities = [newActivity, ...prev]
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 10);
        
        processedActivitiesRef.current.add(activityId);
        
        saveActivitiesToFirebase(newActivities);
        
        console.log('✅ Added new activity:', activityId);
        return newActivities;
      }
      console.log('🔄 Activity already exists, skipping:', activityId);
      return prev;
    });
  }, [saveActivitiesToFirebase]);

  const calculateMonthlyStats = useCallback((attendanceData: any) => {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    let present = 0;
    let late = 0;
    let absent = 0;
    let totalDays = 0;

    if (attendanceData) {
      Object.keys(attendanceData).forEach((date: string) => {
        const [year, month] = date.split('-').map(Number);
        if (year === currentYear && month === currentMonth + 1) {
          totalDays++;
          const record = attendanceData[date];

          if (record.status === 'Present') present++;
          else if (record.status === 'Late') late++;
          else if (record.status === 'Absent') absent++;
        }
      });
    }

    const attendancePercentage = totalDays > 0 ? Math.round(((present + late) / totalDays) * 100) : 0;
    return { present, late, absent, totalDays, attendancePercentage };
  }, []);

  const getGuardianName = () => {
    if (student?.guardians) {
      const guardians = normalizeGuardians(student.guardians);
      const userEmail = user?.email;

      if (userEmail) {
        const matchedGuardian = findGuardianByEmail(guardians, userEmail);
        if (matchedGuardian) {
          return matchedGuardian.name;
        }
      }

      if (guardians.length > 0) {
        return guardians[0].name;
      }
    }
    return parentInfo?.firstName || 'Parent';
  };

  const clearRecentActivity = useCallback(async (activityId: string) => {
    const updatedActivities = recentActivities.filter(activity => activity.id !== activityId);
    setRecentActivities(updatedActivities);
    await saveActivitiesToFirebase(updatedActivities);
    console.log('🗑️ Cleared activity:', activityId);
  }, [recentActivities, saveActivitiesToFirebase]);

  const clearAllRecentActivities = useCallback(async () => {
    setRecentActivities([]);
    await saveActivitiesToFirebase([]);
    console.log('🗑️ Cleared all activities');
  }, [saveActivitiesToFirebase]);

  const confirmManualPickup = useCallback(async (student: Student) => {
    const studentFullName = `${student.firstName} ${student.lastName || ''}`.trim();
    const guardianName = getGuardianName();
    
    Alert.alert(
      '✅ Confirm Pickup',
      `Are you confirming that you have picked up ${studentFullName}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: '✅ Yes, Confirmed',
          onPress: async () => {
            try {
              const today = new Date();
              const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              const pickupRef = ref(database, `pickups/${todayDate}/${student.rfid}`);
              
              const manualConfirmation: ManualPickupConfirmation = {
                confirmed: true,
                confirmationTime: Date.now(),
                reason: 'forgot_rfid_card',
                notes: 'Parent confirmed manual pickup - forgot to scan RFID',
                requiresAdminVerification: true
              };
              
              await update(pickupRef, {
                status: "Pending Verification",
                parentName: guardianName,
                parentRfid: "manual_confirmation_pending",
                timeOut: Date.now(),
                manualConfirmation: manualConfirmation,
                reminderSent: true
              });
              
              await notifyAdminManualPickup(student, manualConfirmation);
              
              await sendPushNotification(
                '⏳ Pickup Pending Verification',
                `Manual pickup for ${studentFullName} is waiting for admin approval`,
                {
                  type: 'pickup_update',
                  studentId: student.id,
                  studentName: studentFullName,
                  status: 'pending_verification',
                  timestamp: Date.now(),
                }
              );
              
              Alert.alert(
                '⏳ Pickup Recorded - Pending Verification',
                `Manual pickup for ${studentFullName} has been recorded.\n\nStatus: Waiting for admin verification\n\nYou will be notified once approved.\n\nReminder: Next time, please don't forget to scan your RFID card.`,
                [{ text: 'Thank You' }]
              );
              
              addRecentActivity({
                type: 'pickup',
                message: `PENDING VERIFICATION: ${guardianName} picked up ${studentFullName} (waiting for admin approval)`,
                timestamp: Date.now(),
                studentName: studentFullName,
              });
              
              reminderAlertShownRef.current = true;
              dailyReminderCheckRef.current = true;
              
            } catch (error) {
              console.error('Error confirming manual pickup:', error);
              Alert.alert(
                '❌ Error',
                'Failed to record pickup. Please try again or contact the school.',
                [{ text: 'OK' }]
              );
            }
          }
        }
      ]
    );
  }, [addRecentActivity, getGuardianName, sendPushNotification]);

  const notifyAdminManualPickup = useCallback(async (student: Student, confirmationData: any) => {
    try {
      const notificationRef = ref(database, `adminNotifications/${Date.now()}`);
      const studentFullName = `${student.firstName} ${student.lastName || ''}`.trim();
      
      await update(notificationRef, {
        type: 'manual_pickup_confirmation',
        studentId: student.id,
        studentName: studentFullName,
        parentName: getGuardianName(),
        timestamp: Date.now(),
        confirmationData: confirmationData,
        status: 'pending_verification',
        urgency: 'high'
      });
      
      console.log('✅ Admin notified of manual pickup');
    } catch (error) {
      console.warn('⚠️ Error notifying admin (continuing anyway):', error);
      // Continue anyway - admin notification is optional
    }
  }, [getGuardianName]);

  // Helper function to trigger server-side notification
  const triggerServerNotification = useCallback(async (
    title: string,
    body: string,
    data: any,
    toUserId: string
  ) => {
    try {
      console.log('🔔 Triggering server notification for user:', toUserId);
      
      // Write notification request to Firebase
      // Your server (server.js) will listen to this and send the push notification
      const notificationRef = ref(database, `notifications/${Date.now()}`);
      await update(notificationRef, {
        toParentId: toUserId,
        title: title,
        body: body,
        data: data,
        timestamp: Date.now(),
        sent: false,
        urgent: data.urgent || false
      });
      
      console.log('✅ Server notification request saved to Firebase');
    } catch (error) {
      console.warn('⚠️ Could not save server notification request (permission denied - this is OK, local notifications still work):', error);
      // Don't throw error - local notifications will still work
      // Server notifications are optional enhancement
    }
  }, []);

  const setupParentNotificationListener = useCallback((student: Student) => {
    if (!student.rfid) {
      console.error('No RFID found for student, cannot setup notification listener');
      return () => {};
    }

    console.log('🔔 Setting up enhanced parent notification listener for RFID:', student.rfid);
    
    const notificationsRef = ref(database, `parentNotifications/${student.rfid}`);
    
    const notificationListener = onValue(notificationsRef, (snapshot) => {
      if (snapshot.exists()) {
        const notifications = snapshot.val();
        
        const unreadNotifications: ParentNotification[] = [];
        
        Object.keys(notifications).forEach(key => {
          const notification = notifications[key] as ParentNotification;
          if (!notification.read && notification.timestamp > lastNotificationCheckRef.current) {
            unreadNotifications.push(notification);
          }
        });
        
        // Update unread notification count
        setUnreadNotificationCount(unreadNotifications.length);
        console.log('🔔 Unread notifications:', unreadNotifications.length);
        
        if (unreadNotifications.length > 0) {
          unreadNotifications.sort((a, b) => b.timestamp - a.timestamp);
          const latestNotification = unreadNotifications[0];
          
          console.log('📱 NEW PARENT NOTIFICATION DETECTED:', latestNotification);
          
          const notificationKey = Object.keys(notifications).find(
            key => (notifications[key] as ParentNotification).timestamp === latestNotification.timestamp
          );
          
          if (notificationKey) {
            update(ref(database, `parentNotifications/${student.rfid}/${notificationKey}`), {
              read: true
            });
          }
          
          const notificationTitle = latestNotification.action === 'Time In' 
            ? (latestNotification.status === 'Late' ? '⚠️ Late Arrival' : '✅ School Arrival')
            : '🏫 School Departure';
            
          const notificationBody = `${latestNotification.studentName} - ${latestNotification.action} at ${formatTime(latestNotification.time)}`;
          
          sendPushNotification(
            notificationTitle,
            notificationBody,
            {
              type: 'attendance_scan',
              studentId: student.id,
              studentName: latestNotification.studentName,
              status: latestNotification.status,
              action: latestNotification.action,
              time: latestNotification.time,
              timestamp: latestNotification.timestamp,
              urgent: true
            },
            true
          );
          
          addRecentActivity({
            type: 'attendance',
            message: `${latestNotification.studentName} ${latestNotification.action} - ${latestNotification.status} at ${formatTime(latestNotification.time)}`,
            timestamp: latestNotification.timestamp,
            studentName: latestNotification.studentName,
          });
          
          lastNotificationCheckRef.current = latestNotification.timestamp;
          
          console.log('✅ PARENT NOTIFICATION PROCESSED');
        }
      }
    });
    
    return () => {
      off(notificationsRef, 'value', notificationListener);
    };
  }, [addRecentActivity, sendPushNotification, formatTime]);

  // ==================== ENHANCED FIREBASE LISTENER ====================
  const setupFirebaseListeners = useCallback((student: Student) => {
    if (listenersSetupRef.current) {
      console.log('🔄 Listeners already setup, skipping');
      return () => {};
    }

    if (!student.rfid) {
      console.error('No RFID found for student:', student.id);
      return () => {};
    }

    listenersSetupRef.current = true;
    console.log('🎯 Setting up Firebase listeners for student:', student.firstName);

    const today = new Date();
    const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const studentFullName = `${student.firstName} ${student.lastName || ''}`.trim();

    const attendanceRef = ref(database, `attendanceLogs/${student.rfid}`);
    const todayAttendanceRef = ref(database, `attendanceLogs/${student.rfid}/${todayDate}`);
    const pickupRef = ref(database, `pickups/${todayDate}/${student.rfid}`);

    reminderAlertShownRef.current = false;
    lastReminderCheckRef.current = 0;
    lastNotificationCheckRef.current = Date.now() - 60000;
    dailyReminderCheckRef.current = false;

    Promise.all([
      get(todayAttendanceRef),
      get(pickupRef),
      get(attendanceRef)
    ]).then(([attendanceSnap, pickupSnap, monthlySnap]) => {
      if (attendanceSnap.exists()) {
        const data = attendanceSnap.val();
        console.log('📊 Today attendance loaded:', data);
        setTodayAttendance(data);
      }

      if (pickupSnap.exists()) {
        const data = pickupSnap.val();
        console.log('🚗 Pickup data loaded:', data);
        setPickupData(data);
        
        if (data.status === 'Waiting' && !data.parentRfid) {
          console.log('🚨 IMMEDIATE ALERT: Student waiting for pickup - SENDING ALERT NOW');
          setTimeout(() => {
            checkAndSendRFIDReminder(student, data);
          }, 3000);
        }
      }

      if (monthlySnap.exists()) {
        const data = monthlySnap.val();
        console.log('📈 Monthly stats data loaded:', Object.keys(data).length, 'days');
        setMonthlyStats(calculateMonthlyStats(data));
      }
    }).catch(error => {
      console.error('❌ Error loading initial data:', error);
    });

    setupBackgroundTask(student);

    // Add the automatic reminder schedulers
    schedule1230To11PMReminders(student);
    scheduleHourlyReminders(student);

    const monthlyListener = onValue(attendanceRef, snapshot => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setMonthlyStats(calculateMonthlyStats(data));
      }
    });

    const todayListener = onValue(todayAttendanceRef, snapshot => {
      const newData = snapshot.exists() ? snapshot.val() : null;
      
      setTodayAttendance(prev => {
        const prevString = JSON.stringify(prev);
        const newString = JSON.stringify(newData);

        if (prevString !== newString) {
          if (newData?.timeIn && (!prev?.timeIn || prev.timeIn !== newData.timeIn)) {
            const message = `${studentFullName} entered school ${newData.status === 'Late' ? 'LATE' : 'ON TIME'} at ${formatTime(newData.timeIn)}`;
            const title = newData.status === 'Late' ? '⚠️ Late Arrival' : '✅ School Arrival';
            
            // Send local notification (for when app is open)
            sendPushNotification(
              title,
              message,
              {
                type: 'attendance_update',
                studentId: student.id,
                studentName: studentFullName,
                status: newData.status,
                time: newData.timeIn,
                timestamp: Date.now(),
                urgent: true
              },
              true
            );

            // Trigger server-side notification (for when app is closed)
            if (user) {
              triggerServerNotification(
                title,
                message,
                {
                  type: 'attendance_update',
                  studentId: student.id,
                  studentName: studentFullName,
                  status: newData.status,
                  urgent: true
                },
                user.uid
              );
            }

            addRecentActivity({
              type: 'attendance',
              message: message,
              timestamp: Date.now(),
              studentName: studentFullName,
            });
            
            console.log('🔔 TIME IN NOTIFICATION SENT (Local + Server)');
          }

          if (newData?.timeOut && (!prev?.timeOut || prev.timeOut !== newData.timeOut)) {
            const message = `${studentFullName} left school at ${formatTime(newData.timeOut)}`;
            const title = '🏫 School Departure';
            
            // Send local notification (for when app is open)
            sendPushNotification(
              title,
              message,
              {
                type: 'attendance_update',
                studentId: student.id,
                studentName: studentFullName,
                status: 'departure',
                time: newData.timeOut,
                timestamp: Date.now(),
                urgent: true
              },
              true
            );

            // Trigger server-side notification (for when app is closed)
            if (user) {
              triggerServerNotification(
                title,
                message,
                {
                  type: 'attendance_update',
                  studentId: student.id,
                  studentName: studentFullName,
                  status: 'departure',
                  urgent: true
                },
                user.uid
              );
            }

            addRecentActivity({
              type: 'attendance',
              message: message,
              timestamp: Date.now(),
              studentName: studentFullName,
            });
            
            console.log('🔔 TIME OUT NOTIFICATION SENT (Local + Server)');
          }
          return newData;
        }
        return prev;
      });
    });

    const pickupListener = onValue(pickupRef, snapshot => {
      const newPickup = snapshot.exists() ? snapshot.val() : null;
      
      setPickupData(prev => {
        const prevString = JSON.stringify(prev);
        const newString = JSON.stringify(newPickup);

        if (prevString !== newString) {
          console.log('🔄 Pickup data changed:', {
            prevStatus: prev?.status,
            newStatus: newPickup?.status,
            prevParentRfid: prev?.parentRfid,
            newParentRfid: newPickup?.parentRfid
          });

          if (newPickup?.status === 'Waiting' && !newPickup.parentRfid) {
            console.log('🚨 PICKUP STATUS CHANGED TO WAITING - SENDING IMMEDIATE ALERT');
            setTimeout(() => {
              // Reset daily flag if new day or pickup resets
              const now = new Date();
              const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              hasShownNotidRef.current[todayDate] = false;
              checkAndSendRFIDReminder(student, newPickup);
            }, 2000);
          }

          if (newPickup?.status === 'Picked Up' && (!prev || prev.status !== 'Picked Up')) {
            let message = '';
            let notificationTitle = '';
            let notificationBody = '';

            if (newPickup.parentRfid === 'manual_confirmation_pending') {
              message = `PENDING VERIFICATION: Manual pickup recorded - Waiting for admin approval`;
              notificationTitle = '⏳ Pickup Pending Verification';
              notificationBody = `Manual pickup for ${studentFullName} is waiting for admin approval`;
            } else if (newPickup.parentRfid === 'manual_confirmation') {
              message = `MANUAL PICKUP APPROVED: ${newPickup.parentName} picked up ${studentFullName}`;
              notificationTitle = '✅ Pickup Approved';
              notificationBody = `Manual pickup for ${studentFullName} has been approved by admin`;
            } else if (newPickup.parentRfid) {
              message = `${newPickup.parentName} picked up ${studentFullName} at ${formatDateTime(newPickup.timeOut)}`;
              notificationTitle = '✅ Child Picked Up';
              notificationBody = `${studentFullName} has been picked up by ${newPickup.parentName}`;
            }
            
            if (message) {
              // Send local notification (for when app is open)
              sendPushNotification(
                notificationTitle,
                notificationBody,
                {
                  type: 'pickup_update',
                  studentId: student.id,
                  studentName: studentFullName,
                  status: newPickup.status,
                  parentName: newPickup.parentName,
                  timestamp: Date.now()
                }
              );

              // Trigger server-side notification (for when app is closed)
              if (user) {
                triggerServerNotification(
                  notificationTitle,
                  notificationBody,
                  {
                    type: 'pickup_update',
                    studentId: student.id,
                    studentName: studentFullName,
                    status: newPickup.status,
                    urgent: true
                  },
                  user.uid
                );
              }

              addRecentActivity({
                type: 'pickup',
                message: message,
                timestamp: newPickup.timeOut || Date.now(),
                studentName: studentFullName,
              });
            }
            
            reminderAlertShownRef.current = false;
            dailyReminderCheckRef.current = true;
            
            if (scheduledHourlyRemindersRef.current) {
              clearTimeout(scheduledHourlyRemindersRef.current);
              console.log('🛑 Hourly reminders stopped - Student picked up');
            }
          } else if (newPickup?.status === 'Pending Verification' && (!prev || prev.status !== 'Pending Verification')) {
            addRecentActivity({
              type: 'pickup',
              message: `PENDING VERIFICATION: Manual pickup waiting for admin approval`,
              timestamp: newPickup.timeOut || Date.now(),
              studentName: studentFullName,
            });
            
            reminderAlertShownRef.current = true;
            dailyReminderCheckRef.current = true;
          }
          
          checkAndSendRFIDReminder(student, newPickup);
          
          return newPickup;
        }
        return prev;
      });
    });

    const parentNotificationCleanup = setupParentNotificationListener(student);

    // 🆕 Setup listener for manual attendance entries (for recent activity only, notifications handled by server)
    const manualAttendanceRef = ref(database, 'manualAttendance');
    const manualAttendanceListener = onValue(manualAttendanceRef, (snapshot) => {
      if (snapshot.exists()) {
        const entries = snapshot.val();
        const entriesArray = Object.entries(entries).map(([key, value]: [string, any]) => ({
          key,
          ...value
        }));
        
        // Filter for this student's manual entries
        const studentEntries = entriesArray.filter((entry: any) => 
          entry.studentRfid === student.rfid && 
          entry.timestamp > (lastNotificationCheckRef.current || Date.now() - 60000)
        );
        
        if (studentEntries.length > 0) {
          studentEntries.forEach((entry: any) => {
            console.log('🆕 NEW MANUAL ATTENDANCE ENTRY DETECTED:', entry);
            
            // Only add to recent activity - server.js handles push notifications
            addRecentActivity({
              type: 'attendance',
              message: `📝 Manual Entry: ${entry.studentName} marked ${entry.status} - ${entry.reason}`,
              timestamp: entry.timestamp,
              studentName: entry.studentName,
            });
            
            lastNotificationCheckRef.current = entry.timestamp;
            console.log('✅ MANUAL ATTENDANCE ACTIVITY ADDED');
          });
        }
      }
    });

    return () => {
      console.log('🧹 Cleaning up Firebase listeners and intervals');
      off(attendanceRef, 'value', monthlyListener);
      off(todayAttendanceRef, 'value', todayListener);
      off(pickupRef, 'value', pickupListener);
      off(manualAttendanceRef, 'value', manualAttendanceListener);
      parentNotificationCleanup();
      
      if (backgroundTaskRef.current) {
        clearTimeout(backgroundTaskRef.current);
        backgroundTaskRef.current = null;
      }
      
      if (scheduled1230ReminderRef.current) {
        clearTimeout(scheduled1230ReminderRef.current);
        scheduled1230ReminderRef.current = null;
      }
      
      if (scheduledHourlyRemindersRef.current) {
        clearTimeout(scheduledHourlyRemindersRef.current);
        scheduledHourlyRemindersRef.current = null;
      }
      
      listenersSetupRef.current = false;
    };
  }, [addRecentActivity, calculateMonthlyStats, formatTime, formatDateTime, checkAndSendRFIDReminder, sendPushNotification, setupParentNotificationListener, setupBackgroundTask, schedule1230To11PMReminders, scheduleHourlyReminders]);

  useEffect(() => {
    const now = new Date();
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    
    const timeUntilMidnight = midnight.getTime() - now.getTime();
    
    const midnightReset = setTimeout(() => {
      console.log('🔄 Daily reset: Clearing reminder flags');
      reminderAlertShownRef.current = false;
      lastReminderCheckRef.current = 0;
      dailyReminderCheckRef.current = false;
      processedActivitiesRef.current.clear();
      processedNotificationsRef.current.clear();
      setRecentActivities([]);
    }, timeUntilMidnight);

    return () => clearTimeout(midnightReset);
  }, []);

  useEffect(() => {
    if (!user || dataLoadedRef.current) {
      setLoading(false);
      return;
    }

    console.log('🚀 Starting to load student data...');

    const loadUserData = async () => {
      setLoading(true);
      setError(null);

      try {
        console.log('📧 Loading data for user:', user.email);

        const userRef = ref(database, `users/${user.uid}`);
        
        // Setup real-time listener for user data (including photo updates)
        const userListener = onValue(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const userData = snapshot.val() as ParentInfo;
            setParentInfo({ ...userData, userId: user.uid, email: user.email || undefined });
            console.log('✅ Parent info updated from Firebase');
          }
        });
        
        // Initial load
        const userSnapshot = await get(userRef);
        if (userSnapshot.exists()) {
          const userData = userSnapshot.val() as ParentInfo;
          setParentInfo({ ...userData, userId: user.uid, email: user.email || undefined });
        }

        let foundStudent: Student | null = null;

        if (childData) {
          try {
            foundStudent = JSON.parse(childData) as Student;
          } catch (parseError) {
            const studentRef = ref(database, `students/${childData}`);
            const studentSnapshot = await get(studentRef);
            if (studentSnapshot.exists()) {
              foundStudent = { id: childData, ...studentSnapshot.val() } as Student;
            }
          }
        } else {
          console.log('🔍 Searching for student linked to user email:', user.email);
          const studentsRef = ref(database, 'students');
          const studentsSnapshot = await get(studentsRef);
          
          if (studentsSnapshot.exists()) {
            const students = studentsSnapshot.val() as { [key: string]: any };
            
            for (const [studentId, studentData] of Object.entries(students)) {
              if (studentData.guardians) {
                const guardiansArray = normalizeGuardians(studentData.guardians);
                const foundGuardian = findGuardianByEmail(guardiansArray, user.email);

                if (foundGuardian) {
                  foundStudent = { 
                    id: studentId, 
                    rfid: studentData.rfid || studentId,
                    ...studentData 
                  };
                  console.log('✅ Found matching student:', foundStudent?.firstName);
                  break;
                }
              }
            }
          }
        }

        if (foundStudent) {
          console.log('🎯 Setting student:', foundStudent.firstName);
          setStudent(foundStudent);
          
          const savedActivities = await loadActivitiesFromFirebase();
          if (savedActivities.length > 0) {
            setRecentActivities(savedActivities);
          }
          
          const cleanup = setupFirebaseListeners(foundStudent);
          
          // Setup unread message counter
          const messagesRef = ref(database, `messages/${foundStudent.id}`);
          const unreadMessagesListener = onValue(messagesRef, (snapshot) => {
            if (snapshot.exists()) {
              const messages = snapshot.val();
              let unreadCount = 0;
              for (const msgId in messages) {
                const msg = messages[msgId];
                if (msg.sender === 'teacher' && !msg.read) {
                  unreadCount++;
                }
              }
              setUnreadMessageCount(unreadCount);
              console.log('📬 Unread messages:', unreadCount);
            } else {
              setUnreadMessageCount(0);
            }
          });
          
          // Add cleanup for message listener
          const originalCleanup = cleanup;
          const enhancedCleanup = () => {
            console.log('🧹 Cleaning up unread messages listener');
            off(messagesRef, 'value', unreadMessagesListener);
            if (originalCleanup) originalCleanup();
          };
          
          Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
          ]).start();
          
          dataLoadedRef.current = true;
          setLoading(false);

          return enhancedCleanup;
        } else {
          const errorMsg = `No student found linked to your email (${user.email}). Please contact administrator.`;
          setError(errorMsg);
          setLoading(false);
        }

      } catch (error) {
        console.error('❌ Error loading user data:', error);
        setError('Error loading user data. Please try again.');
        setLoading(false);
      }
    };

    let cleanupFunction: (() => void) | undefined;
    let userListenerCleanup: (() => void) | undefined;

    loadUserData().then(cleanup => {
      if (cleanup) {
        cleanupFunction = cleanup;
      }
    });

    return () => {
      console.log('🧹 Cleaning up user data listener');
      if (cleanupFunction) {
        cleanupFunction();
      }
      if (userListenerCleanup) {
        userListenerCleanup();
      }
      // Cleanup user listener
      if (user) {
        const userRef = ref(database, `users/${user.uid}`);
        off(userRef, 'value');
      }
    };

  }, [user, childData]);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        const reloadActivities = async () => {
          const savedActivities = await loadActivitiesFromFirebase();
          setRecentActivities(savedActivities);
        };
        
        reloadActivities();
      }
    }, [user, loadActivitiesFromFirebase])
  );

  // ==================== DEBUG COMPONENT ====================
  const DebugInfo = () => {
    if (!student || !showDebug) return null;
    
    return (
      <View style={styles.debugContainer}>
        <Text style={styles.debugTitle}>🧪 Debug Information</Text>
        
        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Student RFID:</Text>
          <Text style={styles.debugValue}>{student.rfid}</Text>
        </View>
        
        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Pickup Status:</Text>
          <Text style={styles.debugValue}>{pickupData?.status || 'No data'}</Text>
        </View>
        
        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Parent RFID:</Text>
          <Text style={styles.debugValue}>{pickupData?.parentRfid || 'Not scanned'}</Text>
        </View>
        
        <View style={styles.debugRow}>
          <Text style={styles.debugLabel}>Background Task:</Text>
          <Text style={styles.debugValue}>{backgroundTaskRef.current ? 'Running' : 'Stopped'}</Text>
        </View>
        
        <View style={styles.debugButtons}>
          <TouchableOpacity style={styles.debugButton} onPress={testSimpleNotification}>
            <Text style={styles.debugButtonText}>Test Notification</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.debugButton} onPress={checkNotificationPermissions}>
            <Text style={styles.debugButtonText}>Check Permissions</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.debugButton} onPress={simulatePickupWaiting}>
            <Text style={styles.debugButtonText}>Simulate Waiting</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.debugButton} onPress={forceImmediateAlert}>
            <Text style={styles.debugButtonText}>Force Alert</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.debugButton} onPress={clearAllPickupData}>
            <Text style={styles.debugButtonText}>Clear Data</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.debugButton} onPress={testAutomaticReminder}>
            <Text style={styles.debugButtonText}>Test Auto Reminder</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const getPickupStatusDisplay = () => {
    if (!pickupData) {
      return {
        status: 'Waiting',
        icon: 'time-outline' as keyof typeof Ionicons.glyphMap,
        message: 'Not picked up yet',
        color: [COLORS.gray500, COLORS.gray400] as [string, string]
      };
    }

    if (pickupData.status === 'Pending Verification' || 
        (pickupData.parentRfid === 'manual_confirmation_pending' && pickupData.status !== 'Picked Up')) {
      return {
        status: 'Pending Verification',
        icon: 'time' as keyof typeof Ionicons.glyphMap,
        message: `By: ${pickupData.parentName} (Awaiting Admin Approval)`,
        color: [COLORS.warning, '#fbbf24'] as [string, string]
      };
    }

    if (pickupData.status === 'Picked Up' && pickupData.parentRfid === 'manual_confirmation') {
      return {
        status: 'Picked Up (Manual)',
        icon: 'checkmark-done' as keyof typeof Ionicons.glyphMap,
        message: `By: ${pickupData.parentName} (Manual Confirmation)`,
        color: ['#8b5cf6', '#a78bfa'] as [string, string]
      };
    }

    if (pickupData.status === 'Picked Up' && pickupData.parentRfid && 
        pickupData.parentRfid !== 'manual_confirmation_pending' && 
        pickupData.parentRfid !== 'manual_confirmation') {
      return {
        status: 'Picked Up',
        icon: 'checkmark-circle' as keyof typeof Ionicons.glyphMap,
        message: `By: ${pickupData.parentName}`,
        color: [COLORS.success, '#34d399'] as [string, string]
      };
    }

    return {
      status: 'Waiting',
      icon: 'time-outline' as keyof typeof Ionicons.glyphMap,
      message: 'Waiting for RFID scan',
      color: [COLORS.warning, '#fbbf24'] as [string, string]
    };
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'Present': return COLORS.success;
      case 'Late': return COLORS.warning;
      case 'Absent': return COLORS.error;
      default: return COLORS.gray500;
    }
  };

  const getStatusGradient = (status: string): [string, string] => {
    switch (status) {
      case 'Present': return [COLORS.success, '#34d399'];
      case 'Late': return [COLORS.warning, '#fbbf24'];
      case 'Absent': return [COLORS.error, '#f87171'];
      default: return [COLORS.gray500, COLORS.gray400];
    }
  };

  const getStatusIcon = (status: string): keyof typeof Ionicons.glyphMap => {
    switch (status) {
      case 'Present': return 'checkmark-circle';
      case 'Late': return 'time';
      case 'Absent': return 'close-circle';
      default: return 'help-circle';
    }
  };

  const handleRetry = () => {
    dataLoadedRef.current = false;
    setLoading(true);
    setError(null);
    setStudent(null);
    
    if (!user) {
      router.replace('/');
      return;
    }
  };

  const handleLogout = async () => {
    try {
      // Clear push tokens from Firebase before logging out
      if (user) {
        console.log('🧹 Clearing push tokens for user:', user.uid);
        const updates: any = {};
        updates[`users/${user.uid}/pushToken`] = null;
        updates[`users/${user.uid}/expoPushToken`] = null;
        updates[`parents/${user.uid}/pushToken`] = null;
        updates[`parents/${user.uid}/expoPushToken`] = null;
        updates[`parents/${user.uid}/fcmToken`] = null;
        
        await update(ref(database), updates);
        console.log('✅ Push tokens cleared from Firebase');
      }
      
      await signOut(auth);
      router.replace('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleActivityPress = (activity: Activity) => {
    Alert.alert(
      'Activity Details',
      activity.message,
      [
        { 
          text: 'Clear Notification', 
          onPress: () => clearRecentActivity(activity.id)
        },
        { text: 'OK', style: 'cancel' }
      ]
    );
  };

  const handleMessagePress = () => {
    console.log('💬 Message icon clicked - Navigating to messages');
    router.navigate('/message');
  };

  const handleParentAvatarPress = () => {
    console.log('👤 Avatar clicked - Navigating to profile');
    router.push('/profile');
  };

  const toggleDebug = () => {
    setShowDebug(!showDebug);
  };

  const handleChildCardPress = () => {
    setShowChildDetails(true);
  };

  const closeChildDetails = () => {
    setShowChildDetails(false);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      console.log('🔄 Refreshing home screen data...');
      
      // Reload parent info
      if (user) {
        const userRef = ref(database, `users/${user.uid}`);
        const userSnapshot = await get(userRef);
        if (userSnapshot.exists()) {
          const userData = userSnapshot.val() as ParentInfo;
          setParentInfo({ ...userData, userId: user.uid, email: user.email || undefined });
          console.log('✅ Parent info refreshed');
        }
      }
      
      // Reload today's attendance
      if (student?.rfid) {
        const today = new Date();
        const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const todayAttendanceRef = ref(database, `attendanceLogs/${student.rfid}/${todayDate}`);
        const attendanceSnap = await get(todayAttendanceRef);
        if (attendanceSnap.exists()) {
          setTodayAttendance(attendanceSnap.val());
          console.log('✅ Today attendance refreshed');
        }
        
        // Reload pickup data
        const pickupRef = ref(database, `pickups/${todayDate}/${student.rfid}`);
        const pickupSnap = await get(pickupRef);
        if (pickupSnap.exists()) {
          setPickupData(pickupSnap.val());
          console.log('✅ Pickup data refreshed');
        }
        
        // Reload monthly stats
        const attendanceRef = ref(database, `attendanceLogs/${student.rfid}`);
        const monthlySnap = await get(attendanceRef);
        if (monthlySnap.exists()) {
          setMonthlyStats(calculateMonthlyStats(monthlySnap.val()));
          console.log('✅ Monthly stats refreshed');
        }
      }
      
      console.log('✅ Home screen refresh complete');
    } catch (error) {
      console.error('❌ Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [user, student, calculateMonthlyStats]);

  // --- RENDER LOGIC ---
  if (loading) {
    return (
      <View style={styles.fullScreenContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
        <LinearGradient colors={COLORS.primaryGradient} style={styles.loadingContainer}>
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color={COLORS.white} />
            <Text style={styles.loadingText}>Loading student data...</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.fullScreenContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
        <LinearGradient colors={COLORS.primaryGradient} style={styles.loadingContainer}>
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color={COLORS.white} />
            <Text style={styles.loadingText}>Checking authentication...</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => router.replace('/')}>
              <Text style={styles.retryButtonText}>Go to Login</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    );
  }

  if (error || !student) {
    return (
      <View style={styles.fullScreenContainer}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
        <LinearGradient colors={COLORS.primaryGradient} style={styles.errorContainer}>
          <View style={styles.errorContent}>
            <View style={styles.errorIconContainer}>
              <Ionicons name="warning-outline" size={48} color={COLORS.white} />
            </View>
            <Text style={styles.errorTitle}>Account Linking Issue</Text>
            <Text style={styles.errorText}>{error || 'No student data found'}</Text>
            <Text style={styles.errorHelp}>
              Please make sure your email is linked to a student account.
            </Text>

            <View style={styles.errorButtons}>
              <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                <Ionicons name="refresh" size={20} color={COLORS.primary} />
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.helpButton} onPress={() => router.push('./help')}>
                <Text style={styles.helpButtonText}>Get Help</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                <Text style={styles.logoutButtonText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  }

  const pickupStatus = getPickupStatusDisplay();

  return (
    <View style={styles.fullScreenContainer}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      <LinearGradient colors={COLORS.primaryGradient} style={styles.header}>
        <View style={styles.headerCircle1} />
        <View style={styles.headerCircle2} />
        <View style={styles.headerContent}>
          <View style={styles.parentInfoContainer}>
            <TouchableWithoutFeedback onPress={handleParentAvatarPress}>
              <View style={styles.parentAvatarContainer}>
                {parentInfo?.photoBase64 ? (
                  <Image source={{ uri: parentInfo.photoBase64 }} style={styles.parentAvatar} />
                ) : (
                  <View style={styles.parentAvatarPlaceholder}>
                    <Ionicons name="person" size={24} color={COLORS.white} />
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
            <View style={styles.parentTextContainer}>
              <Text style={styles.parentWelcome}>Welcome back,</Text>
              <Text style={styles.parentName}>{getGuardianName()}</Text>
              <View style={styles.roleBadge}>
                <Ionicons name="shield-checkmark" size={12} color={COLORS.white} />
                <Text style={styles.roleLabel}>Parent</Text>
              </View>
            </View>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity 
              style={styles.iconButton}
              onPress={handleMessagePress}
            >
              <Ionicons name="chatbubble-outline" size={22} color={COLORS.white} />
              {unreadMessageCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollViewContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
            title="Pull to refresh"
            titleColor={COLORS.gray600}
          />
        }
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

          {/* Enhanced Student Card */}
          <TouchableOpacity onPress={handleChildCardPress} activeOpacity={0.8}>
            <View style={styles.studentCard}>
              <View style={styles.studentCardHeader}>
              <View style={styles.studentCardTitleContainer}>
                <Ionicons name="heart" size={20} color={COLORS.error} />
                <Text style={styles.studentCardTitle}>My Child</Text>
              </View>
              <View style={styles.studentStatusIndicator}>
                <View style={[styles.statusDot, { backgroundColor: todayAttendance?.status ? getStatusColor(todayAttendance.status) : COLORS.gray400 }]} />
                <Text style={styles.studentStatusText}>
                  {todayAttendance?.status || 'Not Scanned'}
                </Text>
              </View>
            </View>
            <View style={styles.studentInfoRow}>
              <View style={styles.avatarContainer}>
                <Image
                  source={{
                    uri: student.photo || student.photoBase64 || 'https://cdn-icons-png.flaticon.com/512/5349/5349022.png',
                  }}
                  style={styles.avatar}
                />
                <View style={styles.onlineIndicator} />
              </View>
              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>
                  {student.firstName} {student.middleName || ''} {student.lastName || ''}
                </Text>
                <View style={styles.studentDetails}>
                  <View style={styles.detailBadge}>
                    <Ionicons name="school-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.detailText}>
                      {student.gradeLevel}
                    </Text>
                  </View>
                  <View style={styles.detailBadge}>
                    <Ionicons name="id-card-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.detailText}>
                      RFID: {student.rfid || student.id}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
          </TouchableOpacity>

          {/* Enhanced Stats Container */}
          <View style={styles.statsContainer}>
            <LinearGradient colors={['#1999e8', '#1488d0']} style={styles.statCard}>
              <View style={styles.statIconContainer}>
                <Ionicons name="calendar" size={24} color={COLORS.white} />
              </View>
              <Text style={styles.statNumber}>{monthlyStats.attendancePercentage}%</Text>
              <Text style={styles.statLabel}>Monthly Attendance</Text>
              <Text style={styles.statSubtext}>{monthlyStats.present + monthlyStats.late}/{monthlyStats.totalDays} days</Text>
            </LinearGradient>

            <LinearGradient colors={['#ef4444', '#dc2626']} style={styles.statCard}>
              <View style={styles.statIconContainer}>
                <Ionicons name="warning" size={24} color={COLORS.white} />
              </View>
              <Text style={styles.statNumber}>{monthlyStats.absent}</Text>
              <Text style={styles.statLabel}>Absences</Text>
              <Text style={styles.statSubtext}>This month</Text>
            </LinearGradient>

            <LinearGradient colors={['#f59e0b', '#d97706']} style={styles.statCard}>
              <View style={styles.statIconContainer}>
                <Ionicons name="time" size={24} color={COLORS.white} />
              </View>
              <Text style={styles.statNumber}>{monthlyStats.late}</Text>
              <Text style={styles.statLabel}>Late Arrivals</Text>
              <Text style={styles.statSubtext}>This month</Text>
            </LinearGradient>
          </View>

          {/* Enhanced Status Row */}
          <View style={styles.statusRow}>
            <View style={styles.statusCard}>
              <LinearGradient
                colors={todayAttendance?.status ? getStatusGradient(todayAttendance.status) : [COLORS.gray500, COLORS.gray400]}
                style={styles.statusCardInner}
              >
                <View style={styles.statusHeader}>
                  <View style={styles.statusTitleContainer}>
                    <Ionicons name="today-outline" size={18} color={COLORS.white} />
                    <Text style={styles.statusTitle}>Today's Attendance</Text>
                  </View>
                  <View style={styles.statusIndicator}>
                    <Ionicons
                      name={getStatusIcon(todayAttendance?.status || 'Unknown')}
                      size={16}
                      color={COLORS.white}
                    />
                  </View>
                </View>
                <View style={styles.statusContent}>
                  <Text style={styles.statusText}>
                    {todayAttendance?.status || 'Not Scanned'}
                  </Text>
                  {todayAttendance?.timeIn && (
                    <Text style={styles.statusTime}>
                      In: {formatTime(todayAttendance.timeIn)}
                    </Text>
                  )}
                  {todayAttendance?.timeOut && (
                    <Text style={styles.statusTime}>
                      Out: {formatTime(todayAttendance.timeOut)}
                    </Text>
                  )}
                  {!todayAttendance && (
                    <Text style={styles.statusTime}>
                      No scan today
                    </Text>
                  )}
                </View>
              </LinearGradient>
            </View>

            <View style={styles.statusCard}>
              <LinearGradient
                colors={pickupStatus.color}
                style={styles.statusCardInner}
              >
                <View style={styles.statusHeader}>
                  <View style={styles.statusTitleContainer}>
                    <Ionicons name="car-sport-outline" size={18} color={COLORS.white} />
                    <Text style={styles.statusTitle}>Pick-up Status</Text>
                  </View>
                  <View style={styles.statusIndicator}>
                    <Ionicons
                      name={pickupStatus.icon}
                      size={16}
                      color={COLORS.white}
                    />
                  </View>
                </View>
                <View style={styles.statusContent}>
                  <Text style={styles.statusText}>
                    {pickupStatus.status}
                  </Text>
                  <Text style={styles.statusTime}>
                    {pickupStatus.message}
                  </Text>
                  {pickupData && (pickupData.status === 'Picked Up' || pickupData.status === 'Pending Verification') && (
                    <Text style={styles.statusTime}>
                      At: {formatDateTime(pickupData.timeOut)}
                    </Text>
                  )}
                </View>
              </LinearGradient>
            </View>
          </View>

          {/* Bottom Spacer for Tab Bar */}
          <View style={styles.bottomSpacer} />
        </Animated.View>
      </ScrollView>

      {/* Child Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showChildDetails}
        onRequestClose={closeChildDetails}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Child Information</Text>
                <TouchableOpacity onPress={closeChildDetails} style={styles.closeButton}>
                  <Ionicons name="close" size={28} color={COLORS.gray700} />
                </TouchableOpacity>
              </View>

              {/* Student Photo */}
              <View style={styles.modalPhotoContainer}>
                <Image
                  source={{
                    uri: student?.photo || student?.photoBase64 || 'https://cdn-icons-png.flaticon.com/512/5349/5349022.png',
                  }}
                  style={styles.modalPhoto}
                />
              </View>

              {/* Full Name */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Full Name</Text>
                <Text style={styles.modalSectionValue}>
                  {student?.firstName} {student?.middleName || ''} {student?.lastName || ''}
                </Text>
              </View>

              {/* Grade & Section */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Grade & Section</Text>
                <View style={styles.modalRow}>
                  <View style={styles.modalBadge}>
                    <Ionicons name="school" size={20} color={COLORS.primary} />
                    <Text style={styles.modalBadgeText}>
                      Grade {student?.gradeLevel}
                    </Text>
                  </View>
                  <View style={styles.modalBadge}>
                    <Ionicons name="people" size={20} color={COLORS.primary} />
                    <Text style={styles.modalBadgeText}>
                      Section {student?.section || 'N/A'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* RFID */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>RFID Number</Text>
                <View style={styles.modalRfidBadge}>
                  <Ionicons name="card" size={24} color={COLORS.primary} />
                  <Text style={styles.modalRfidText}>
                    {student?.rfid || student?.id}
                  </Text>
                </View>
              </View>

              {/* Guardians */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Guardians</Text>
                {student?.guardians && normalizeGuardians(student.guardians).map((guardian, index) => (
                  <View key={index} style={styles.guardianCard}>
                    <View style={styles.guardianHeader}>
                      <Ionicons name="person-circle" size={24} color={COLORS.primary} />
                      <Text style={styles.guardianName}>{guardian.name}</Text>
                    </View>
                    <View style={styles.guardianDetails}>
                      <View style={styles.guardianDetailRow}>
                        <Ionicons name="mail" size={16} color={COLORS.gray600} />
                        <Text style={styles.guardianDetailText}>{guardian.email}</Text>
                      </View>
                      <View style={styles.guardianDetailRow}>
                        <Ionicons name="call" size={16} color={COLORS.gray600} />
                        <Text style={styles.guardianDetailText}>{guardian.contact}</Text>
                      </View>
                      <View style={styles.guardianDetailRow}>
                        <Ionicons name="home" size={16} color={COLORS.gray600} />
                        <Text style={styles.guardianDetailText}>{guardian.address}</Text>
                      </View>
                      {guardian.relationship && (
                        <View style={styles.guardianDetailRow}>
                          <Ionicons name="heart" size={16} color={COLORS.gray600} />
                          <Text style={styles.guardianDetailText}>{guardian.relationship}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>

              {/* Attendance Stats */}
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Monthly Attendance</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={styles.statItemValue}>{monthlyStats.present}</Text>
                    <Text style={styles.statItemLabel}>Present</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statItemValue}>{monthlyStats.late}</Text>
                    <Text style={styles.statItemLabel}>Late</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statItemValue}>{monthlyStats.absent}</Text>
                    <Text style={styles.statItemLabel}>Absent</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statItemValue}>{monthlyStats.attendancePercentage}%</Text>
                    <Text style={styles.statItemLabel}>Rate</Text>
                  </View>
                </View>
              </View>

              {/* Today's Status */}
              {todayAttendance && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Today's Status</Text>
                  <View style={styles.todayStatusCard}>
                    <LinearGradient
                      colors={getStatusGradient(todayAttendance.status)}
                      style={styles.todayStatusGradient}
                    >
                      <Ionicons 
                        name={getStatusIcon(todayAttendance.status)} 
                        size={32} 
                        color={COLORS.white} 
                      />
                      <Text style={styles.todayStatusText}>{todayAttendance.status}</Text>
                      {todayAttendance.timeIn && (
                        <Text style={styles.todayStatusTime}>
                          Time In: {formatTime(todayAttendance.timeIn)}
                        </Text>
                      )}
                      {todayAttendance.timeOut && (
                        <Text style={styles.todayStatusTime}>
                          Time Out: {formatTime(todayAttendance.timeOut)}
                        </Text>
                      )}
                    </LinearGradient>
                  </View>
                </View>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// COMPLETE STYLES
const styles = StyleSheet.create({
  fullScreenContainer: { 
    flex: 1, 
    backgroundColor: COLORS.primary
  },
  scrollView: { 
    flex: 1,
    backgroundColor: '#f1f5f9'
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: SPACING.xl,
  },
  loadingContainer: { 
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    padding: SPACING.xl,
  },
  errorContainer: { 
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContent: {
    alignItems: 'center',
    padding: SPACING.xl,
    width: '100%',
  },
  errorIconContainer: {
    marginBottom: SPACING.lg,
  },
  errorButtons: {
    width: '100%',
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  loadingText: { 
    marginTop: SPACING.md, 
    fontSize: 16, 
    color: COLORS.white, 
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  errorTitle: { 
    fontSize: 22, 
    color: COLORS.white, 
    fontWeight: '900', 
    marginBottom: SPACING.sm, 
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  errorText: { 
    fontSize: 16, 
    color: COLORS.white, 
    textAlign: 'center', 
    marginBottom: SPACING.sm, 
    lineHeight: 24,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  errorHelp: { 
    fontSize: 14, 
    color: 'rgba(255,255,255,0.85)', 
    textAlign: 'center', 
    marginBottom: SPACING.lg, 
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  retryButton: { 
    backgroundColor: COLORS.white, 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: SPACING.lg, 
    paddingVertical: SPACING.md, 
    borderRadius: BORDER_RADIUS.lg, 
    marginBottom: SPACING.sm, 
    width: '80%', 
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  retryButtonText: { 
    color: COLORS.primary, 
    fontWeight: '800', 
    marginLeft: SPACING.xs,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  helpButton: { 
    backgroundColor: 'transparent', 
    borderWidth: 2, 
    borderColor: COLORS.white, 
    paddingHorizontal: SPACING.lg, 
    paddingVertical: SPACING.md, 
    borderRadius: BORDER_RADIUS.lg, 
    width: '80%', 
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  helpButtonText: { 
    color: COLORS.white, 
    fontWeight: '800', 
    textAlign: 'center',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  logoutButton: { 
    backgroundColor: 'rgba(255,255,255,0.2)', 
    paddingHorizontal: SPACING.lg, 
    paddingVertical: SPACING.md, 
    borderRadius: BORDER_RADIUS.lg, 
    width: '80%', 
    justifyContent: 'center', 
    marginTop: SPACING.sm,
  },
  logoutButtonText: { 
    color: COLORS.white, 
    fontWeight: '800', 
    textAlign: 'center',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    position: 'relative',
    overflow: 'hidden',
  },
  headerCircle1: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  headerCircle2: {
    position: 'absolute',
    bottom: -40,
    left: -40,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerContent: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start',
  },
  headerButtons: { 
    flexDirection: 'row', 
    alignItems: 'center',
    gap: SPACING.sm,
  },
  parentInfoContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    flex: 1,
  },
  parentAvatarContainer: { 
    marginRight: SPACING.md,
  },
  parentAvatar: { 
    width: 56, 
    height: 56, 
    borderRadius: BORDER_RADIUS['2xl'], 
    borderWidth: 3, 
    borderColor: 'rgba(255,255,255,0.5)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  parentAvatarPlaceholder: { 
    width: 56, 
    height: 56, 
    borderRadius: BORDER_RADIUS['2xl'], 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 3, 
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  parentTextContainer: { 
    flex: 1,
  },
  parentWelcome: { 
    ...TYPOGRAPHY.sm, 
    color: 'rgba(255,255,255,0.95)', 
    marginBottom: 4,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    fontSize: 11,
  },
  parentName: { 
    ...TYPOGRAPHY['2xl'], 
    fontWeight: '900', 
    color: COLORS.white, 
    marginBottom: SPACING.sm,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  roleBadge: { 
    backgroundColor: 'rgba(255,255,255,0.35)', 
    paddingHorizontal: SPACING.md, 
    paddingVertical: 6, 
    borderRadius: BORDER_RADIUS.full, 
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  roleLabel: { 
    ...TYPOGRAPHY.xs, 
    color: COLORS.white, 
    fontWeight: '700',
    marginLeft: 4,
    letterSpacing: 0.5,
    fontSize: 11,
  },
  iconButton: { 
    padding: SPACING.sm, 
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  content: { 
    padding: SPACING.lg,
    paddingTop: 0,
    backgroundColor: '#f1f5f9',
  },
  studentCard: { 
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS['2xl'], 
    padding: SPACING.xl, 
    marginBottom: SPACING.xl, 
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(25, 153, 232, 0.15)',
  },
  studentCardHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: SPACING.xl,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(25, 153, 232, 0.15)',
  },
  studentCardTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentCardTitle: { 
    ...TYPOGRAPHY.lg, 
    fontWeight: '800', 
    color: COLORS.gray900,
    marginLeft: SPACING.sm,
    letterSpacing: 0.3,
  },
  studentStatusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: BORDER_RADIUS.full,
    marginRight: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  studentStatusText: {
    ...TYPOGRAPHY.xs,
    fontWeight: '700',
    color: COLORS.gray700,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  studentInfoRow: { 
    flexDirection: 'row', 
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: SPACING.lg,
  },
  avatar: { 
    width: 90, 
    height: 90, 
    borderRadius: BORDER_RADIUS['2xl'], 
    borderWidth: 4, 
    borderColor: '#1999e8',
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.success,
    borderWidth: 3,
    borderColor: COLORS.white,
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
  studentInfo: { 
    flex: 1,
  },
  studentName: { 
    fontSize: 22, 
    fontWeight: '900', 
    color: COLORS.gray900, 
    marginBottom: SPACING.md,
    letterSpacing: 0.3,
    lineHeight: 28,
  },
  studentDetails: { 
    gap: SPACING.sm,
  },
  detailBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(25, 153, 232, 0.1)', 
    paddingHorizontal: SPACING.md, 
    paddingVertical: 10, 
    borderRadius: BORDER_RADIUS.xl, 
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: 'rgba(25, 153, 232, 0.2)',
  },
  detailText: { 
    ...TYPOGRAPHY.sm, 
    color: COLORS.gray700, 
    marginLeft: SPACING.sm,
    fontWeight: '600',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  statsContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    marginBottom: SPACING.xl, 
    gap: SPACING.sm,
  },
  statCard: { 
    borderRadius: BORDER_RADIUS.xl, 
    padding: SPACING.lg, 
    alignItems: 'center', 
    flex: 1, 
    minHeight: 130, 
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  statIconContainer: { 
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.3)',
    padding: 12,
    borderRadius: BORDER_RADIUS.xl,
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  statNumber: { 
    fontSize: 36, 
    fontWeight: '900', 
    color: COLORS.white, 
    marginBottom: 6,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
  },
  statLabel: { 
    fontSize: 13, 
    color: 'rgba(255,255,255,0.98)', 
    textAlign: 'center', 
    fontWeight: '800', 
    marginBottom: 4,
    letterSpacing: 0.4,
    lineHeight: 18,
  },
  statSubtext: { 
    fontSize: 11, 
    color: 'rgba(255,255,255,0.85)', 
    textAlign: 'center',
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  statusRow: { 
    flexDirection: 'row', 
    gap: SPACING.sm, 
    marginBottom: SPACING.xl,
  },
  statusCard: {
    flex: 1,
    borderRadius: BORDER_RADIUS.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  statusCardInner: {
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    minHeight: 150,
  },
  statusHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.25)',
  },
  statusTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  statusTitle: { 
    fontSize: 12, 
    color: 'rgba(255,255,255,0.95)', 
    fontWeight: '700', 
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  statusIndicator: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 6,
    borderRadius: BORDER_RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusContent: { 
    alignItems: 'flex-start',
    flex: 1,
    justifyContent: 'center',
  },
  statusText: { 
    fontSize: 22, 
    color: COLORS.white, 
    fontWeight: '900', 
    marginBottom: 6,
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 6,
  },
  statusTime: { 
    fontSize: 14, 
    color: 'rgba(255,255,255,0.95)', 
    marginBottom: 3,
    fontWeight: '600',
    letterSpacing: 0.3,
    lineHeight: 20,
  },
  bottomSpacer: {
    height: 100,
  },
  // Debug Styles
  debugContainer: {
    backgroundColor: COLORS.gray100,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.gray300,
  },
  debugTitle: {
    ...TYPOGRAPHY.sm,
    fontWeight: 'bold',
    color: COLORS.gray700,
    marginBottom: SPACING.sm,
  },
  debugRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  debugLabel: {
    ...TYPOGRAPHY.xs,
    color: COLORS.gray600,
  },
  debugValue: {
    ...TYPOGRAPHY.xs,
    color: COLORS.gray800,
    fontWeight: '600',
  },
  debugButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  debugButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    flex: 1,
    minWidth: '45%',
  },
  debugButtonText: {
    ...TYPOGRAPHY.xs,
    color: COLORS.white,
    textAlign: 'center',
    fontWeight: '600',
  },
  testButton: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  testButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  testButtonText: {
    ...TYPOGRAPHY.sm,
    color: COLORS.white,
    fontWeight: '700',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.xl,
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    ...TYPOGRAPHY['2xl'],
    fontWeight: '900',
    color: COLORS.gray900,
    letterSpacing: 0.3,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  modalPhotoContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    backgroundColor: COLORS.gray50,
  },
  modalPhoto: {
    width: 140,
    height: 140,
    borderRadius: BORDER_RADIUS['2xl'],
    borderWidth: 5,
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  modalSection: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  modalSectionValue: {
    ...TYPOGRAPHY.xl,
    fontWeight: '800',
    color: COLORS.gray900,
    letterSpacing: 0.3,
  },
  modalRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  modalBadgeText: {
    ...TYPOGRAPHY.sm,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  modalRfidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(25, 153, 232, 0.08)',
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(25, 153, 232, 0.2)',
  },
  modalRfidText: {
    ...TYPOGRAPHY.lg,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 1,
  },
  guardianCard: {
    backgroundColor: '#f8fafc',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.md,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  guardianHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  guardianName: {
    ...TYPOGRAPHY.lg,
    fontWeight: '800',
    color: COLORS.gray900,
  },
  guardianDetails: {
    gap: SPACING.sm,
  },
  guardianDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  guardianDetailText: {
    ...TYPOGRAPHY.sm,
    color: COLORS.gray700,
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  statItem: {
    backgroundColor: '#f8fafc',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xl,
    alignItems: 'center',
    flex: 1,
    minWidth: '45%',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
  },
  statItemValue: {
    ...TYPOGRAPHY['2xl'],
    fontWeight: '900',
    color: COLORS.primary,
    marginBottom: 4,
  },
  statItemLabel: {
    ...TYPOGRAPHY.xs,
    color: COLORS.gray600,
    fontWeight: '600',
  },
  todayStatusCard: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  todayStatusGradient: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  todayStatusText: {
    ...TYPOGRAPHY['2xl'],
    fontWeight: '900',
    color: COLORS.white,
    marginTop: SPACING.sm,
    letterSpacing: 0.3,
  },
  todayStatusTime: {
    ...TYPOGRAPHY.sm,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
    fontWeight: '600',
  },
});

export default HomeScreen;