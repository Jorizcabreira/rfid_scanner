import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { get, off, onValue, ref, update } from 'firebase/database';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
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
  xs: 6,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
};

const TYPOGRAPHY = {
  xs: { fontSize: 12, lineHeight: 16, fontFamily: 'System' },
  sm: { fontSize: 14, lineHeight: 18, fontFamily: 'System' },
  base: { fontSize: 16, lineHeight: 22, fontFamily: 'System' },
  lg: { fontSize: 18, lineHeight: 24, fontFamily: 'System' },
  xl: { fontSize: 20, lineHeight: 26, fontFamily: 'System' },
  '2xl': { fontSize: 24, lineHeight: 30, fontFamily: 'System' },
  '3xl': { fontSize: 28, lineHeight: 34, fontFamily: 'System' },
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
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
  const [showAttendanceDetails, setShowAttendanceDetails] = useState(false);
  const [showPickupDetails, setShowPickupDetails] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  
  // Use refs to track reminder state without causing re-renders
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

  // ==================== UTILITY FUNCTIONS - DECLARE FIRST ====================
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
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }, []);

  const addRecentActivity = useCallback((activity: Omit<Activity, 'id'>) => {
    const activityId = `${activity.type}-${activity.timestamp}-${activity.message.substring(0, 30).replace(/\s+/g, '_')}`;
    
    if (processedActivitiesRef.current.has(activityId)) {
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
        
        console.log('✅ Added new activity:', activityId);
        return newActivities;
      }
      return prev;
    });
  }, []);

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

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'Present': return COLORS.success;
      case 'Late': return COLORS.warning;
      case 'Absent': return COLORS.error;
      default: return COLORS.gray500;
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

  const getPickupStatusDisplay = () => {
    if (!pickupData) {
      return {
        status: 'Waiting',
        icon: 'time-outline' as keyof typeof Ionicons.glyphMap,
        message: 'Not picked up yet',
        color: COLORS.gray500
      };
    }

    if (pickupData.status === 'Pending Verification' || 
        (pickupData.parentRfid === 'manual_confirmation_pending' && pickupData.status !== 'Picked Up')) {
      return {
        status: 'Pending Verification',
        icon: 'time' as keyof typeof Ionicons.glyphMap,
        message: `By: ${pickupData.parentName} (Awaiting Admin Approval)`,
        color: COLORS.warning
      };
    }

    if (pickupData.status === 'Picked Up' && pickupData.parentRfid === 'manual_confirmation') {
      return {
        status: 'Picked Up (Manual)',
        icon: 'checkmark-done' as keyof typeof Ionicons.glyphMap,
        message: `By: ${pickupData.parentName} (Manual Confirmation)`,
        color: '#8b5cf6'
      };
    }

    if (pickupData.status === 'Picked Up' && pickupData.parentRfid && 
        pickupData.parentRfid !== 'manual_confirmation_pending' && 
        pickupData.parentRfid !== 'manual_confirmation') {
      return {
        status: 'Picked Up',
        icon: 'checkmark-circle' as keyof typeof Ionicons.glyphMap,
        message: `By: ${pickupData.parentName}`,
        color: COLORS.success
      };
    }

    return {
      status: 'Waiting',
      icon: 'time-outline' as keyof typeof Ionicons.glyphMap,
      message: 'Waiting for RFID scan',
      color: COLORS.warning
    };
  };

  // ==================== FIREBASE SETUP ====================
  const setupFirebaseListeners = useCallback((student: Student) => {
    if (listenersSetupRef.current) {
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

    const attendanceRef = ref(database, `attendanceLogs/${student.rfid}`);
    const todayAttendanceRef = ref(database, `attendanceLogs/${student.rfid}/${todayDate}`);
    const pickupRef = ref(database, `pickups/${todayDate}/${student.rfid}`);

    // Load initial data
    Promise.all([
      get(todayAttendanceRef),
      get(pickupRef),
      get(attendanceRef)
    ]).then(([attendanceSnap, pickupSnap, monthlySnap]) => {
      if (attendanceSnap.exists()) {
        setTodayAttendance(attendanceSnap.val());
      }
      if (pickupSnap.exists()) {
        setPickupData(pickupSnap.val());
      }
      if (monthlySnap.exists()) {
        setMonthlyStats(calculateMonthlyStats(monthlySnap.val()));
      }
    });

    // Set up real-time listeners
    const monthlyListener = onValue(attendanceRef, snapshot => {
      if (snapshot.exists()) {
        setMonthlyStats(calculateMonthlyStats(snapshot.val()));
      }
    });

    const todayListener = onValue(todayAttendanceRef, snapshot => {
      const newData = snapshot.exists() ? snapshot.val() : null;
      setTodayAttendance(newData);
    });

    const pickupListener = onValue(pickupRef, snapshot => {
      const newPickup = snapshot.exists() ? snapshot.val() : null;
      setPickupData(newPickup);
    });

    return () => {
      off(attendanceRef, 'value', monthlyListener);
      off(todayAttendanceRef, 'value', todayListener);
      off(pickupRef, 'value', pickupListener);
      listenersSetupRef.current = false;
    };
  }, [calculateMonthlyStats]);

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
        return;
      }

      console.log('✅ Notification permission granted');

      try {
        const token = (await Notifications.getExpoPushTokenAsync({
          projectId: '15369961-bc79-4ea5-a604-b52f908a92ae'
        })).data;
        console.log('📱 Expo Push Token:', token.substring(0, 30) + '...');
        
        if (user) {
          const pushTokenData = {
            token: token,
            platform: Platform.OS,
            deviceId: Device.modelName || 'unknown',
            createdAt: Date.now(),
            updatedAt: Date.now()
          };

          // Save token in multiple locations for redundancy
          const userRef = ref(database, `users/${user.uid}`);
          await update(userRef, {
            expoPushToken: token,
            pushToken: pushTokenData,
            tokenUpdatedAt: Date.now()
          });
          
          console.log('✅ Push token saved to Firebase');
        }
      } catch (tokenError) {
        console.warn('⚠️ Expo push token error:', tokenError);
      }

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

      // Create notification content without channelId
      const notificationContent: Notifications.NotificationContentInput = {
        title: title,
        body: body,
        data: data,
        sound: true,
        badge: data.badge || 1,
      };

      // Add priority and channelId conditionally
      if (Platform.OS === 'android') {
        (notificationContent as any).priority = 'high';
        (notificationContent as any).channelId = 'default';
      } else {
        // For iOS, use different approach
        (notificationContent as any).priority = 'high';
      }

      const scheduledNotificationId = await Notifications.scheduleNotificationAsync({
        content: notificationContent,
        trigger: null,
      });

      processedNotificationsRef.current.add(notificationId);
      
      if (processedNotificationsRef.current.size > 100) {
        const array = Array.from(processedNotificationsRef.current);
        processedNotificationsRef.current = new Set(array.slice(-50));
      }

      console.log('✅ Notification sent successfully');
      
      return scheduledNotificationId;

    } catch (error) {
      console.error('❌ Error sending notification:', error);
      throw error;
    }
  }

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
                `Manual pickup for ${studentFullName} has been recorded.\n\nStatus: Waiting for admin verification`,
                [{ text: 'Thank You' }]
              );
              
              addRecentActivity({
                type: 'pickup',
                message: `PENDING VERIFICATION: ${guardianName} picked up ${studentFullName} (waiting for admin approval)`,
                timestamp: Date.now(),
                studentName: studentFullName,
              });
              
            } catch (error) {
              console.error('Error confirming manual pickup:', error);
              Alert.alert(
                '❌ Error',
                'Failed to record pickup. Please try again.',
                [{ text: 'OK' }]
              );
            }
          }
        }
      ]
    );
  }, [addRecentActivity, getGuardianName, sendPushNotification]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      console.log('🔄 Refreshing home screen data...');
      
      if (user) {
        const userRef = ref(database, `users/${user.uid}`);
        const userSnapshot = await get(userRef);
        if (userSnapshot.exists()) {
          const userData = userSnapshot.val() as ParentInfo;
          setParentInfo({ ...userData, userId: user.uid, email: user.email || undefined });
        }
      }
      
      if (student?.rfid) {
        const today = new Date();
        const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        
        const todayAttendanceRef = ref(database, `attendanceLogs/${student.rfid}/${todayDate}`);
        const attendanceSnap = await get(todayAttendanceRef);
        if (attendanceSnap.exists()) {
          setTodayAttendance(attendanceSnap.val());
        }
        
        const pickupRef = ref(database, `pickups/${todayDate}/${student.rfid}`);
        const pickupSnap = await get(pickupRef);
        if (pickupSnap.exists()) {
          setPickupData(pickupSnap.val());
        }
        
        const attendanceRef = ref(database, `attendanceLogs/${student.rfid}`);
        const monthlySnap = await get(attendanceRef);
        if (monthlySnap.exists()) {
          setMonthlyStats(calculateMonthlyStats(monthlySnap.val()));
        }
      }
      
    } catch (error) {
      console.error('❌ Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [user, student, calculateMonthlyStats]);

  const handleNotificationResponse = useCallback(async (response: Notifications.NotificationResponse) => {
    console.log('👆 Notification response received:', response);
    const data = response.notification.request.content.data as any;
    const actionIdentifier = response.actionIdentifier;
    
    if (data.notificationId) {
      processedNotificationsRef.current.add(data.notificationId as string);
    }
    
    if (actionIdentifier === 'CONFIRM_PICKUP') {
      console.log('✅ User confirmed pickup via notification action button');
      
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
          
          await update(pickupRef, {
            status: "Pending Verification",
            parentName: guardianName,
            parentRfid: "manual_confirmation_pending",
            timeOut: Date.now(),
            manualConfirmation: manualConfirmation,
            reminderSent: true
          });
          
          await sendPushNotification(
            '⏳ Pickup Confirmation Received',
            `Thank you! Your pickup confirmation for ${studentFullName} is pending admin verification.`,
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
          
        } catch (error) {
          console.error('❌ Error processing manual pickup confirmation:', error);
        }
      }
    } 
    else if (actionIdentifier === 'NOT_YET') {
      console.log('❌ User said not picked up yet');
      reminderAlertShownRef.current = false;
      dailyReminderCheckRef.current = false;
    }
    else if (actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      console.log('📱 User tapped notification body');
      
      if (data.type === 'teacher_message') {
        setTimeout(() => {
          router.push('/message');
        }, 300);
        return;
      }
      
      // Handle other notification types
      if (data.type === 'attendance_scan' || data.type === 'manual_attendance') {
        // Refresh home screen data
        onRefresh();
      }
    }
  }, [student, router, addRecentActivity, getGuardianName, sendPushNotification, onRefresh]);

  // ==================== NOTIFICATION SETUP ====================
  useEffect(() => {
    console.log('🔔 Setting up notification system...');

    registerForPushNotificationsAsync();

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('📱 Notification received:', notification.request.content.title);
      
      // Handle foreground notifications
      const data = notification.request.content.data as any;
      if (data.type === 'teacher_message') {
        // Update badge count
        setUnreadMessageCount(prev => prev + 1);
      }
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      handleNotificationResponse(response);
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [registerForPushNotificationsAsync, handleNotificationResponse]);

  // Check for initial notification when app starts
  useEffect(() => {
    const checkInitialNotification = async () => {
      const lastNotification = await Notifications.getLastNotificationResponseAsync();
      if (lastNotification) {
        console.log('📱 App opened from notification:', lastNotification.notification.request.content.data);
        const data = lastNotification.notification.request.content.data as any;
        
        if (data.type === 'teacher_message') {
          // Navigate to messages screen
          setTimeout(() => {
            router.push('/message');
          }, 300);
        }
      }
    };
    
    checkInitialNotification();
  }, []);

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

  // ==================== DATA LOADING ====================
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
          const cleanup = setupFirebaseListeners(foundStudent);
          
          Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
          
          dataLoadedRef.current = true;
          setLoading(false);

          return cleanup;
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

    loadUserData().then(cleanup => {
      // Cleanup will be handled by useEffect return
    });

  }, [user, childData, normalizeGuardians, findGuardianByEmail, setupFirebaseListeners, fadeAnim]);

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
      await signOut(auth);
      router.replace('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleMessagePress = () => {
    console.log('💬 Message icon clicked - Navigating to messages');
    router.navigate('/message');
  };

  const handleParentAvatarPress = () => {
    console.log('👤 Avatar clicked - Navigating to profile');
    router.push('/profile');
  };

  const handleChildCardPress = () => {
    setShowChildDetails(true);
  };

  const closeChildDetails = () => {
    setShowChildDetails(false);
  };

  const handleAttendancePress = () => {
    setShowAttendanceDetails(true);
  };

  const closeAttendanceDetails = () => {
    setShowAttendanceDetails(false);
  };

  const handlePickupPress = () => {
    setShowPickupDetails(true);
  };

  const closePickupDetails = () => {
    setShowPickupDetails(false);
  };

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
      
      {/* Header */}
      <LinearGradient colors={COLORS.primaryGradient} style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.parentInfoContainer}>
            <TouchableWithoutFeedback onPress={handleParentAvatarPress}>
              <View style={styles.parentAvatarContainer}>
                {parentInfo?.photoBase64 ? (
                  <Image 
                    source={{ uri: parentInfo.photoBase64 }} 
                    style={styles.parentAvatar} 
                    onError={(e) => console.log('Error loading parent avatar:', e.nativeEvent.error)}
                  />
                ) : (
                  <View style={styles.parentAvatarPlaceholder}>
                    <Ionicons name="person" size={24} color={COLORS.white} />
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
            <View style={styles.parentTextContainer}>
              <Text style={styles.parentWelcome}>Welcome back</Text>
              <Text style={styles.parentName}>{getGuardianName()}</Text>
            </View>
          </View>
          
          {/* Message Icon with Badge */}
          <TouchableOpacity 
            style={styles.headerIconButton}
            onPress={handleMessagePress}
          >
            <Ionicons name="chatbubble" size={24} color={COLORS.white} />
            {unreadMessageCount > 0 && (
              <View style={styles.messageBadge}>
                <Text style={styles.badgeText}>
                  {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
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
          />
        }
      >
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>

          {/* Compact Student Card */}
          <TouchableOpacity onPress={handleChildCardPress} activeOpacity={0.9}>
            <View style={styles.studentCard}>
              <View style={styles.studentInfoRow}>
                <View style={styles.avatarContainer}>
                  <Image
                    source={{
                      uri: student.photo || student.photoBase64 || 'https://cdn-icons-png.flaticon.com/512/5349/5349022.png',
                    }}
                    style={styles.avatar}
                    onError={(e) => console.log('Error loading student avatar:', e.nativeEvent.error)}
                  />
                  <View style={[styles.statusDot, { 
                    backgroundColor: todayAttendance?.status ? getStatusColor(todayAttendance.status) : COLORS.gray400 
                  }]} />
                </View>
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>
                    {student.firstName} {student.lastName || ''}
                  </Text>
                  <View style={styles.studentDetails}>
                    <View style={styles.detailBadge}>
                      <Ionicons name="school-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.detailText}>
                        Grade {student.gradeLevel}
                      </Text>
                    </View>
                    <View style={styles.detailBadge}>
                      <Ionicons name="time-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.detailText}>
                        {todayAttendance?.status || 'Not Scanned'}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.chevronContainer}>
                  <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
                </View>
              </View>
            </View>
          </TouchableOpacity>

          {/* Compact Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: 'rgba(25, 153, 232, 0.1)' }]}>
                <Ionicons name="calendar" size={20} color={COLORS.primary} />
              </View>
              <Text style={styles.statNumber}>{monthlyStats.attendancePercentage}%</Text>
              <Text style={styles.statLabel}>Attendance</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                <Ionicons name="warning" size={20} color={COLORS.error} />
              </View>
              <Text style={styles.statNumber}>{monthlyStats.absent}</Text>
              <Text style={styles.statLabel}>Absences</Text>
            </View>

            <View style={styles.statCard}>
              <View style={[styles.statIconContainer, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                <Ionicons name="time" size={20} color={COLORS.warning} />
              </View>
              <Text style={styles.statNumber}>{monthlyStats.late}</Text>
              <Text style={styles.statLabel}>Late</Text>
            </View>
          </View>

          {/* Today's Status Cards - NOW CLICKABLE */}
          <View style={styles.statusSection}>
            <Text style={styles.sectionTitle}>Today's Status</Text>
            <View style={styles.statusCards}>
              {/* Attendance Status - CLICKABLE */}
              <TouchableOpacity 
                style={styles.statusCard}
                onPress={handleAttendancePress}
                activeOpacity={0.8}
              >
                <View style={styles.statusHeader}>
                  <View style={styles.statusTitle}>
                    <Ionicons name="today-outline" size={16} color={COLORS.gray600} />
                    <Text style={styles.statusTitleText}>Attendance</Text>
                  </View>
                  <View style={styles.statusRight}>
                    <Ionicons
                      name={getStatusIcon(todayAttendance?.status || 'Unknown')}
                      size={16}
                      color={getStatusColor(todayAttendance?.status || 'Unknown')}
                    />
                    <Ionicons name="chevron-forward" size={14} color={COLORS.gray400} />
                  </View>
                </View>
                <Text style={styles.statusValue}>
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
              </TouchableOpacity>

              {/* Pickup Status - CLICKABLE */}
              <TouchableOpacity 
                style={styles.statusCard}
                onPress={handlePickupPress}
                activeOpacity={0.8}
              >
                <View style={styles.statusHeader}>
                  <View style={styles.statusTitle}>
                    <Ionicons name="car-sport-outline" size={16} color={COLORS.gray600} />
                    <Text style={styles.statusTitleText}>Pickup</Text>
                  </View>
                  <View style={styles.statusRight}>
                    <Ionicons
                      name={pickupStatus.icon}
                      size={16}
                      color={pickupStatus.color}
                    />
                    <Ionicons name="chevron-forward" size={14} color={COLORS.gray400} />
                  </View>
                </View>
                <Text style={styles.statusValue}>
                  {pickupStatus.status}
                </Text>
                <Text style={styles.statusTime}>
                  {pickupStatus.message}
                </Text>
                {pickupData && (pickupData.status === 'Picked Up' || pickupData.status === 'Pending Verification') && (
                  <Text style={styles.statusTime}>
                    {formatDateTime(pickupData.timeOut)}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.actionsSection}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity style={styles.actionButton} onPress={() => student && confirmManualPickup(student)}>
                <View style={[styles.actionIcon, { backgroundColor: 'rgba(16, 185, 129, 0.1)' }]}>
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
                </View>
                <Text style={styles.actionText}>Confirm Pickup</Text>
              </TouchableOpacity>

            </View>
          </View>

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
          <TouchableWithoutFeedback onPress={closeChildDetails}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Child Information</Text>
              <TouchableOpacity onPress={closeChildDetails} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={COLORS.gray700} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.modalPhotoContainer}>
                <Image
                  source={{
                    uri: student?.photo || student?.photoBase64 || 'https://cdn-icons-png.flaticon.com/512/5349/5349022.png',
                  }}
                  style={styles.modalPhoto}
                  onError={(e) => console.log('Error loading modal student photo:', e.nativeEvent.error)}
                />
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Full Name</Text>
                <Text style={styles.modalSectionValue}>
                  {student?.firstName} {student?.middleName || ''} {student?.lastName || ''}
                </Text>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Grade & Section</Text>
                <View style={styles.modalRow}>
                  <View style={styles.modalBadge}>
                    <Ionicons name="school" size={16} color={COLORS.primary} />
                    <Text style={styles.modalBadgeText}>
                      Grade {student?.gradeLevel}
                    </Text>
                  </View>
                  {student?.section && (
                    <View style={styles.modalBadge}>
                      <Ionicons name="people" size={16} color={COLORS.primary} />
                      <Text style={styles.modalBadgeText}>
                        Section {student.section}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>RFID Number</Text>
                <View style={styles.modalRfidBadge}>
                  <Ionicons name="card" size={18} color={COLORS.primary} />
                  <Text style={styles.modalRfidText}>
                    {student?.rfid || student?.id}
                  </Text>
                </View>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Monthly Attendance</Text>
                <View style={styles.statsGridModal}>
                  <View style={styles.statItemModal}>
                    <Text style={styles.statItemValue}>{monthlyStats.present}</Text>
                    <Text style={styles.statItemLabel}>Present</Text>
                  </View>
                  <View style={styles.statItemModal}>
                    <Text style={styles.statItemValue}>{monthlyStats.late}</Text>
                    <Text style={styles.statItemLabel}>Late</Text>
                  </View>
                  <View style={styles.statItemModal}>
                    <Text style={styles.statItemValue}>{monthlyStats.absent}</Text>
                    <Text style={styles.statItemLabel}>Absent</Text>
                  </View>
                  <View style={styles.statItemModal}>
                    <Text style={styles.statItemValue}>{monthlyStats.attendancePercentage}%</Text>
                    <Text style={styles.statItemLabel}>Rate</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Attendance Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showAttendanceDetails}
        onRequestClose={closeAttendanceDetails}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={closeAttendanceDetails}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Attendance Details</Text>
              <TouchableOpacity onPress={closeAttendanceDetails} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={COLORS.gray700} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.modalSection}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={styles.detailValueContainer}>
                    <Ionicons
                      name={getStatusIcon(todayAttendance?.status || 'Unknown')}
                      size={20}
                      color={getStatusColor(todayAttendance?.status || 'Unknown')}
                    />
                    <Text style={[styles.detailValue, { color: getStatusColor(todayAttendance?.status || 'Unknown') }]}>
                      {todayAttendance?.status || 'Not Scanned'}
                    </Text>
                  </View>
                </View>

                {todayAttendance?.timeIn && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Time In</Text>
                    <Text style={styles.detailValue}>{formatTime(todayAttendance.timeIn)}</Text>
                  </View>
                )}

                {todayAttendance?.timeOut && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Time Out</Text>
                    <Text style={styles.detailValue}>{formatTime(todayAttendance.timeOut)}</Text>
                  </View>
                )}

                {!todayAttendance && (
                  <View style={styles.noDataContainer}>
                    <Ionicons name="time-outline" size={48} color={COLORS.gray400} />
                    <Text style={styles.noDataText}>No attendance record for today</Text>
                    <Text style={styles.noDataSubtext}>Waiting for RFID scan at school</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Pickup Details Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showPickupDetails}
        onRequestClose={closePickupDetails}
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={closePickupDetails}>
            <View style={styles.modalBackdrop} />
          </TouchableWithoutFeedback>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pickup Details</Text>
              <TouchableOpacity onPress={closePickupDetails} style={styles.closeButton}>
                <Ionicons name="close" size={24} color={COLORS.gray700} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.modalSection}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View style={styles.detailValueContainer}>
                    <Ionicons
                      name={pickupStatus.icon}
                      size={20}
                      color={pickupStatus.color}
                    />
                    <Text style={[styles.detailValue, { color: pickupStatus.color }]}>
                      {pickupStatus.status}
                    </Text>
                  </View>
                </View>

                {pickupData?.parentName && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Picked Up By</Text>
                    <Text style={styles.detailValue}>{pickupData.parentName}</Text>
                  </View>
                )}

                {pickupData?.timeOut && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Pickup Time</Text>
                    <Text style={styles.detailValue}>{formatDateTime(pickupData.timeOut)}</Text>
                  </View>
                )}

                {pickupData?.manualConfirmation && (
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Confirmation Type</Text>
                    <Text style={styles.detailValue}>Manual Confirmation</Text>
                  </View>
                )}

                {!pickupData && (
                  <View style={styles.noDataContainer}>
                    <Ionicons name="car-sport-outline" size={48} color={COLORS.gray400} />
                    <Text style={styles.noDataText}>Not picked up yet</Text>
                    <Text style={styles.noDataSubtext}>Waiting for RFID scan at pickup</Text>
                  </View>
                )}
              </View>

              {!pickupData && (
                <View style={styles.modalSection}>
                  <TouchableOpacity 
                    style={styles.confirmButton}
                    onPress={() => student && confirmManualPickup(student)}
                  >
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.white} />
                    <Text style={styles.confirmButtonText}>Confirm Manual Pickup</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ENHANCED AND LARGER STYLES
const styles = StyleSheet.create({
  fullScreenContainer: { 
    flex: 1, 
    backgroundColor: COLORS.primary
  },
  scrollView: { 
    flex: 1,
    backgroundColor: COLORS.background
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: SPACING.xl,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : StatusBar.currentHeight,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  headerContent: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
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
    width: 50, 
    height: 50, 
    borderRadius: BORDER_RADIUS.lg, 
    borderWidth: 2, 
    borderColor: 'rgba(255,255,255,0.5)',
  },
  parentAvatarPlaceholder: { 
    width: 50, 
    height: 50, 
    borderRadius: BORDER_RADIUS.lg, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 2, 
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  parentTextContainer: { 
    flex: 1,
  },
  parentWelcome: { 
    ...TYPOGRAPHY.sm, 
    color: 'rgba(255,255,255,0.9)', 
    marginBottom: 2,
    fontWeight: '600',
  },
  parentName: { 
    ...TYPOGRAPHY.xl, 
    fontWeight: '700', 
    color: COLORS.white,
  },
  headerIconButton: { 
    padding: SPACING.sm, 
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    position: 'relative',
  },
  messageBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '800',
  },
  content: { 
    padding: SPACING.lg,
    paddingTop: SPACING.md,
  },
  
  // Student Card
  studentCard: { 
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg, 
    padding: SPACING.lg, 
    marginBottom: SPACING.lg, 
    ...SHADOWS.md,
  },
  studentInfoRow: { 
    flexDirection: 'row', 
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: SPACING.md,
  },
  avatar: { 
    width: 60, 
    height: 60, 
    borderRadius: BORDER_RADIUS.lg, 
    borderWidth: 3, 
    borderColor: COLORS.primary,
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  studentInfo: { 
    flex: 1,
  },
  studentName: { 
    ...TYPOGRAPHY.xl, 
    fontWeight: '700', 
    color: COLORS.gray900, 
    marginBottom: SPACING.xs,
  },
  studentDetails: { 
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  detailBadge: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: COLORS.gray50, 
    paddingHorizontal: SPACING.sm, 
    paddingVertical: 6, 
    borderRadius: BORDER_RADIUS.sm, 
  },
  detailText: { 
    ...TYPOGRAPHY.sm, 
    color: COLORS.gray700, 
    marginLeft: 6,
    fontWeight: '500',
  },
  chevronContainer: {
    padding: SPACING.xs,
  },
  
  // Stats Grid
  statsGrid: { 
    flexDirection: 'row', 
    gap: SPACING.sm, 
    marginBottom: SPACING.lg,
  },
  statCard: { 
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg, 
    padding: SPACING.lg, 
    flex: 1,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  statIconContainer: { 
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.sm,
  },
  statNumber: { 
    ...TYPOGRAPHY.xl, 
    fontWeight: '700', 
    color: COLORS.gray900, 
    marginBottom: 4,
  },
  statLabel: { 
    ...TYPOGRAPHY.sm, 
    color: COLORS.gray600, 
    fontWeight: '500',
  },
  
  // Status Section
  statusSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    ...TYPOGRAPHY.lg,
    fontWeight: '600',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  statusCards: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  statusCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    flex: 1,
    ...SHADOWS.sm,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  statusTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusTitleText: {
    ...TYPOGRAPHY.sm,
    color: COLORS.gray600,
    fontWeight: '500',
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusValue: {
    ...TYPOGRAPHY.lg,
    fontWeight: '600',
    color: COLORS.gray900,
    marginBottom: 4,
  },
  statusTime: {
    ...TYPOGRAPHY.sm,
    color: COLORS.gray500,
  },
  
  // Actions Section
  actionsSection: {
    marginBottom: SPACING.lg,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  actionButton: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    flex: 1,
    minWidth: '47%',
    ...SHADOWS.sm,
    position: 'relative',
  },
  actionIcon: {
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.sm,
    position: 'relative',
  },
  floatingBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: COLORS.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  floatingBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '800',
  },
  actionText: {
    ...TYPOGRAPHY.sm,
    color: COLORS.gray700,
    fontWeight: '500',
    textAlign: 'center',
  },
  
  bottomSpacer: {
    height: 20,
  },

  // Loading & Error States
  loadingContainer: { 
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    padding: SPACING.xl,
  },
  loadingText: { 
    marginTop: SPACING.md, 
    ...TYPOGRAPHY.lg, 
    color: COLORS.white, 
    fontWeight: '600',
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
  errorTitle: { 
    ...TYPOGRAPHY['2xl'], 
    color: COLORS.white, 
    fontWeight: '700', 
    marginBottom: SPACING.sm, 
    textAlign: 'center',
  },
  errorText: { 
    ...TYPOGRAPHY.lg, 
    color: COLORS.white, 
    textAlign: 'center', 
    marginBottom: SPACING.sm, 
    lineHeight: 24,
  },
  errorHelp: { 
    ...TYPOGRAPHY.base, 
    color: 'rgba(255,255,255,0.9)', 
    textAlign: 'center', 
    marginBottom: SPACING.lg, 
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
  },
  retryButtonText: { 
    color: COLORS.primary, 
    fontWeight: '600', 
    marginLeft: SPACING.xs,
    ...TYPOGRAPHY.base,
  },
  helpButton: { 
    backgroundColor: 'transparent', 
    borderWidth: 1, 
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
    fontWeight: '600', 
    textAlign: 'center',
    ...TYPOGRAPHY.base,
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
    fontWeight: '600', 
    textAlign: 'center',
    ...TYPOGRAPHY.base,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalScrollView: {
    maxHeight: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  modalTitle: {
    ...TYPOGRAPHY.xl,
    fontWeight: '700',
    color: COLORS.gray900,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  modalPhotoContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  modalPhoto: {
    width: 120,
    height: 120,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 4,
    borderColor: COLORS.primary,
  },
  modalSection: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  modalSectionTitle: {
    ...TYPOGRAPHY.base,
    fontWeight: '600',
    color: COLORS.gray600,
    marginBottom: SPACING.md,
    textTransform: 'uppercase',
  },
  modalSectionValue: {
    ...TYPOGRAPHY.xl,
    fontWeight: '700',
    color: COLORS.gray900,
  },
  modalRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  modalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    gap: SPACING.sm,
  },
  modalBadgeText: {
    ...TYPOGRAPHY.base,
    fontWeight: '500',
    color: COLORS.gray700,
  },
  modalRfidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(25, 153, 232, 0.1)',
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    gap: SPACING.sm,
  },
  modalRfidText: {
    ...TYPOGRAPHY.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  statsGridModal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  statItemModal: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.lg,
    alignItems: 'center',
    flex: 1,
    minWidth: '45%',
  },
  statItemValue: {
    ...TYPOGRAPHY.xl,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
  },
  statItemLabel: {
    ...TYPOGRAPHY.sm,
    color: COLORS.gray600,
    fontWeight: '500',
  },

  // Detail Item Styles
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  detailLabel: {
    ...TYPOGRAPHY.base,
    color: COLORS.gray600,
    fontWeight: '500',
  },
  detailValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  detailValue: {
    ...TYPOGRAPHY.lg,
    fontWeight: '600',
  },

  // No Data Styles
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  noDataText: {
    ...TYPOGRAPHY.lg,
    color: COLORS.gray600,
    fontWeight: '600',
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  noDataSubtext: {
    ...TYPOGRAPHY.base,
    color: COLORS.gray500,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },

  // Confirm Button
  confirmButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  confirmButtonText: {
    ...TYPOGRAPHY.lg,
    color: COLORS.white,
    fontWeight: '600',
  },
});

export default HomeScreen;