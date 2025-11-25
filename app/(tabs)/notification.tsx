import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';
import { get, off, onValue, ref, remove, update } from 'firebase/database';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  PanResponder,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { auth, database } from '../../firebaseConfig';

interface ParentNotification {
  id: string;
  type: string;
  studentRfid: string;
  studentName: string;
  action: string;
  status: string;
  time: string;
  timestamp: number;
  read: boolean;
  title?: string;
  message: string;
  displayTime: string;
  parentName?: string;
  isActivity?: boolean;
  isNew?: boolean;
}

interface Student {
  id: string;
  firstName: string;
  lastName?: string;
  rfid?: string;
}

interface Activity {
  type: 'attendance' | 'pickup' | 'reminder';
  message: string;
  timestamp: number;
  studentName: string;
  id: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = -80;
const SWIPE_OUT_DURATION = 200;

const DELETED_NOTIFICATIONS_KEY = 'deleted_notifications';
const DELETED_ACTIVITIES_KEY = 'deleted_activities';
const DISPLAY_TIMES_KEY = 'notification_display_times';
const NEW_NOTIFICATIONS_KEY = 'new_notifications';
const BADGE_COUNT_KEY = 'notification_badge_count';

const NotificationScreen = () => {
  const [notifications, setNotifications] = useState<ParentNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(false);
  const notificationSetupRef = useRef(false);
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  const [deletedNotifications, setDeletedNotifications] = useState<Set<string>>(new Set());
  const [deletedActivities, setDeletedActivities] = useState<Set<string>>(new Set());
  const [displayTimes, setDisplayTimes] = useState<Record<string, string>>({});
  const [newNotifications, setNewNotifications] = useState<Set<string>>(new Set());

  const lastRefreshTimeRef = useRef<number>(0);
  const isRefreshingRef = useRef(false);
  const focusCountRef = useRef(0);
  const dataLoadedRef = useRef(false);

  // Badge count synchronization functions
  const updateTabBadgeCount = async (count: number) => {
    try {
      await AsyncStorage.setItem(BADGE_COUNT_KEY, count.toString());
      console.log('📱 Tab badge count updated:', count);
    } catch (error) {
      console.error('Error updating tab badge count:', error);
    }
  };

  const getTabBadgeCount = async (): Promise<number> => {
    try {
      const count = await AsyncStorage.getItem(BADGE_COUNT_KEY);
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      console.error('Error getting tab badge count:', error);
      return 0;
    }
  };

  useEffect(() => {
    loadPersistedData();
  }, []);

  const loadPersistedData = async () => {
    try {
      const [deletedNotifs, deletedActs, savedDisplayTimes, savedNewNotifications] = await Promise.all([
        AsyncStorage.getItem(DELETED_NOTIFICATIONS_KEY),
        AsyncStorage.getItem(DELETED_ACTIVITIES_KEY),
        AsyncStorage.getItem(DISPLAY_TIMES_KEY),
        AsyncStorage.getItem(NEW_NOTIFICATIONS_KEY)
      ]);

      if (deletedNotifs) {
        setDeletedNotifications(new Set(JSON.parse(deletedNotifs)));
      }
      if (deletedActs) {
        setDeletedActivities(new Set(JSON.parse(deletedActs)));
      }
      if (savedDisplayTimes) {
        setDisplayTimes(JSON.parse(savedDisplayTimes));
      }
      if (savedNewNotifications) {
        setNewNotifications(new Set(JSON.parse(savedNewNotifications)));
      }
    } catch (error) {
      console.error('Error loading persisted data:', error);
    }
  };

  const saveDeletedItems = async () => {
    try {
      await Promise.all([
        AsyncStorage.setItem(DELETED_NOTIFICATIONS_KEY, JSON.stringify([...deletedNotifications])),
        AsyncStorage.setItem(DELETED_ACTIVITIES_KEY, JSON.stringify([...deletedActivities]))
      ]);
    } catch (error) {
      console.error('Error saving deleted items:', error);
    }
  };

  const saveDisplayTimes = async (times: Record<string, string>) => {
    try {
      await AsyncStorage.setItem(DISPLAY_TIMES_KEY, JSON.stringify(times));
    } catch (error) {
      console.error('Error saving display times:', error);
    }
  };

  const saveNewNotifications = async (newNotifs: Set<string>) => {
    try {
      await AsyncStorage.setItem(NEW_NOTIFICATIONS_KEY, JSON.stringify([...newNotifs]));
    } catch (error) {
      console.error('Error saving new notifications:', error);
    }
  };

  const markNotificationsAsSeen = async (notificationIds: string[]) => {
    const updatedNewNotifications = new Set(newNotifications);
    notificationIds.forEach(id => {
      updatedNewNotifications.delete(id);
    });
    setNewNotifications(updatedNewNotifications);
    await saveNewNotifications(updatedNewNotifications);
  };

  const addToNewNotifications = async (notificationId: string) => {
    const updatedNewNotifications = new Set(newNotifications);
    updatedNewNotifications.add(notificationId);
    setNewNotifications(updatedNewNotifications);
    await saveNewNotifications(updatedNewNotifications);
  };

  const formatDisplayTime = useCallback((timestamp: number, notificationId: string) => {
    if (displayTimes[notificationId]) {
      return displayTimes[notificationId];
    }

    const now = Date.now();
    const notificationTime = timestamp;
    const diffInMinutes = Math.floor((now - notificationTime) / (1000 * 60));
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);
    
    let displayTime: string;
    
    if (diffInMinutes < 1) {
      displayTime = 'Just now';
    } else if (diffInMinutes < 60) {
      displayTime = `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      displayTime = `${diffInHours}h ago`;
    } else if (diffInDays === 1) {
      displayTime = 'Yesterday';
    } else if (diffInDays < 7) {
      displayTime = `${diffInDays}d ago`;
    } else {
      const date = new Date(timestamp);
      displayTime = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    }

    const newDisplayTimes = { ...displayTimes, [notificationId]: displayTime };
    setDisplayTimes(newDisplayTimes);
    saveDisplayTimes(newDisplayTimes);

    return displayTime;
  }, [displayTimes]);

  const createNotificationContent = (notification: any): { title: string; message: string } => {
    const studentName = notification.studentName || 'Your child';
    
    if (notification.type === 'attendance_scan' || notification.type === 'attendance_update') {
      if (notification.action === 'Time In' || notification.message?.includes('arrived') || notification.message?.includes('entered')) {
        if (notification.status === 'Late' || notification.message?.includes('LATE')) {
          return {
            title: 'Late Arrival',
            message: `${studentName} arrived late at ${notification.time || 'school'}`
          };
        } else {
          return {
            title: 'School Arrival',
            message: `${studentName} arrived at school at ${notification.time || 'school time'}`
          };
        }
      } else if (notification.action === 'Time Out' || notification.message?.includes('left')) {
        return {
          title: 'School Departure',
          message: `${studentName} left school at ${notification.time || 'school time'}`
        };
      }
    }
    
    if (notification.type === 'pickup_update' || notification.type === 'manual_pickup_confirmation') {
      if (notification.status === 'Picked Up') {
        if (notification.parentRfid === 'manual_confirmation') {
          return {
            title: 'Manual Pickup Approved',
            message: `Manual pickup for ${studentName} has been approved by admin`
          };
        } else if (notification.parentRfid === 'manual_confirmation_pending') {
          return {
            title: 'Pickup Pending Verification',
            message: `Manual pickup for ${studentName} is waiting for admin approval`
          };
        } else {
          return {
            title: 'Child Picked Up',
            message: `${studentName} has been picked up by ${notification.parentName || 'parent'}`
          };
        }
      } else if (notification.status === 'Pending Verification') {
        return {
          title: 'Pickup Pending',
          message: `Manual pickup for ${studentName} is waiting for admin approval`
        };
      }
    }
    
    if (notification.type === 'reminder') {
      if (notification.action === 'daily_reminder_1230_2100') {
        return {
          title: 'Daily Pickup Reminder',
          message: `Don't forget to scan your RFID when picking up ${studentName}`
        };
      } else if (notification.action === 'pickup_reminder_alert') {
        return {
          title: 'Forgot to Scan RFID?',
          message: `Have you picked up ${studentName} but forgot to scan your RFID card?`
        };
      } else {
        return {
          title: 'Pickup Reminder',
          message: notification.message || `Don't forget to scan RFID when picking up ${studentName}`
        };
      }
    }

    if (notification.type === 'hourly_reminder_1230_2100') {
      return {
        title: 'Pickup Reminder',
        message: `Reminder: Please scan your RFID when picking up ${studentName}`
      };
    }

    if (notification.type === 'admin_notification') {
      return {
        title: 'School Announcement',
        message: notification.message
      };
    }

    if (notification.message) {
      if (notification.message.includes('LATE') || notification.message.includes('Late')) {
        return {
          title: 'Late Arrival',
          message: notification.message
        };
      } else if (notification.message.includes('arrived') || notification.message.includes('entered')) {
        return {
          title: 'School Arrival',
          message: notification.message
        };
      } else if (notification.message.includes('left') || notification.message.includes('departure')) {
        return {
          title: 'School Departure',
          message: notification.message
        };
      } else if (notification.message.includes('PENDING VERIFICATION') || notification.message.includes('waiting for admin')) {
        return {
          title: 'Pickup Pending Verification',
          message: notification.message
        };
      } else if (notification.message.includes('MANUAL PICKUP') || notification.message.includes('picked up')) {
        return {
          title: 'Pickup Completed',
          message: notification.message
        };
      } else if (notification.message.includes('Reminder sent') || notification.message.includes('reminder')) {
        return {
          title: 'Pickup Reminder',
          message: notification.message
        };
      }
    }
    
    return {
      title: 'School Update',
      message: notification.message || `${studentName} - ${notification.action || 'update'} at ${notification.time || 'school'}`
    };
  };

  const loadStudentData = useCallback(async (userEmail: string | null) => {
    if (!userEmail) {
      console.log('No user email provided, skipping student lookup');
      return null;
    }
    try {
      console.log('Loading student data for:', userEmail);
      const studentsRef = ref(database, 'students');
      const snapshot = await get(studentsRef);
      
      if (snapshot.exists()) {
        const students = snapshot.val();
        let foundStudent: Student | null = null;

        for (const [studentId, studentData] of Object.entries(students)) {
          const studentObj = studentData as any;
          if (studentObj.guardians) {
            const guardians = Array.isArray(studentObj.guardians) 
              ? studentObj.guardians 
              : Object.values(studentObj.guardians);
            
            const isLinked = guardians.some((guardian: any) => {
              const guardianEmail = guardian.email?.toLowerCase();
              return guardianEmail === userEmail?.toLowerCase();
            });

            if (isLinked) {
              foundStudent = { 
                id: studentId, 
                firstName: studentObj.firstName,
                lastName: studentObj.lastName,
                rfid: studentObj.rfid || studentId
              };
              console.log('Found student:', foundStudent.firstName);
              break;
            }
          }
        }

        if (foundStudent) {
          setStudent(foundStudent);
          return foundStudent;
        } else {
          console.log('No student found linked to email');
        }
      } else {
        console.log('No students found in database');
      }
      return null;
    } catch (error) {
      console.error('Error loading student data:', error);
      return null;
    }
  }, []);

  const loadUserActivities = useCallback(async (userId: string, student: Student) => {
    try {
      console.log('Loading user activities for:', userId);
      const activitiesRef = ref(database, `users/${userId}/recentActivities`);
      const activitiesSnapshot = await get(activitiesRef);
      
      const activitiesArray: ParentNotification[] = [];
      
      if (activitiesSnapshot.exists()) {
        const activitiesData = activitiesSnapshot.val();
        const activities = activitiesData.activities || [];
        
        console.log('Found activities:', activities.length);
        
        activities.forEach((activity: Activity) => {
          const activityId = `activity-${activity.id || activity.timestamp}`;
          
          if (deletedActivities.has(activityId)) {
            console.log('Skipping deleted activity:', activityId);
            return;
          }
          
          const content = createNotificationContent(activity);
          
          if (content.title && content.message) {
            activitiesArray.push({
              id: activityId,
              type: activity.type,
              studentRfid: student.rfid || '',
              studentName: activity.studentName || student.firstName,
              action: activity.type,
              status: 'info',
              time: new Date(activity.timestamp).toLocaleTimeString(),
              timestamp: activity.timestamp,
              read: true,
              title: content.title,
              message: content.message,
              displayTime: formatDisplayTime(activity.timestamp, activityId),
              isActivity: true,
              isNew: newNotifications.has(activityId)
            });
          }
        });
      }
      
      return activitiesArray;
    } catch (error) {
      console.error('Error loading user activities:', error);
      return [];
    }
  }, [deletedActivities, formatDisplayTime, newNotifications]);

  const loadParentNotifications = useCallback(async (studentRfid: string) => {
    try {
      console.log('Loading parent notifications for RFID:', studentRfid);
      const notificationsRef = ref(database, `parentNotifications/${studentRfid}`);
      const snapshot = await get(notificationsRef);
      
      const notificationsArray: ParentNotification[] = [];
      const attendanceScanKeys = new Set<string>();
      
      if (snapshot.exists()) {
        const notificationsData = snapshot.val();
        
        Object.keys(notificationsData).forEach(key => {
          if (deletedNotifications.has(key)) {
            console.log('Skipping deleted notification:', key);
            return;
          }
          const notification = notificationsData[key];
          if (notification.type === 'attendance_scan') {
            const date = notification.time ? notification.time.split(' ')[0] : '';
            const scanKey = `${notification.studentRfid || ''}-${date}-${notification.action}`;
            if (attendanceScanKeys.has(scanKey)) {
              return;
            }
            attendanceScanKeys.add(scanKey);
          }
          const content = createNotificationContent(notification);
          if (content.title && content.message && notification.type !== 'teacher_message') {
            notificationsArray.push({
              id: key,
              ...notification,
              title: content.title,
              message: content.message,
              displayTime: formatDisplayTime(notification.timestamp, key),
              isActivity: false,
              isNew: newNotifications.has(key)
            });
          }
        });
        
        console.log('Loaded parent notifications:', notificationsArray.length);
      } else {
        console.log('No parent notifications found');
      }
      
      return notificationsArray;
    } catch (error) {
      console.error('Error loading parent notifications:', error);
      return [];
    }
  }, [deletedNotifications, formatDisplayTime, newNotifications]);

  const detectNewNotifications = useCallback((currentNotifications: ParentNotification[], previousNotifications: ParentNotification[]) => {
    const currentIds = new Set(currentNotifications.map(notif => notif.id));
    const previousIds = new Set(previousNotifications.map(notif => notif.id));
    
    const newIds = [...currentIds].filter(id => !previousIds.has(id));
    
    if (newIds.length > 0) {
      console.log('New notifications detected:', newIds);
      const updatedNewNotifications = new Set(newNotifications);
      newIds.forEach(id => {
        updatedNewNotifications.add(id);
      });
      setNewNotifications(updatedNewNotifications);
      saveNewNotifications(updatedNewNotifications);
    }
  }, [newNotifications]);

  const calculateUnreadCount = useCallback((notifs: ParentNotification[]) => {
    return notifs.filter(notif => !notif.read && !notif.isActivity).length;
  }, []);

  const calculateNewCount = useCallback((notifs: ParentNotification[]) => {
    return notifs.filter(notif => notif.isNew).length;
  }, []);

  const markAllAsReadOnOpen = useCallback(async () => {
    if (!student?.rfid || unreadCount === 0) return;
    
    try {
      const updates: any = {};
      const unreadNotifications = notifications.filter(notif => !notif.read && !notif.isActivity);
      
      unreadNotifications.forEach(notification => {
        if (!deletedNotifications.has(notification.id)) {
          updates[`parentNotifications/${student.rfid}/${notification.id}/read`] = true;
        }
      });
      
      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
        
        setNotifications(prev => prev.map(notif => ({
          ...notif,
          read: true
        })));
        
        setUnreadCount(0);
        
        // Sync badge count
        await updateTabBadgeCount(0);
        
        console.log('Marked all notifications as read on screen open');
      }
    } catch (error) {
      console.error('Error marking all as read on open:', error);
    }
  }, [student, notifications, unreadCount, deletedNotifications]);

  const setupNotificationListener = useCallback((student: Student) => {
    if (!student.rfid) {
      console.error('No RFID found for student');
      return () => {};
    }

    console.log('Setting up real-time notification listener for RFID:', student.rfid);
    
    const notificationsRef = ref(database, `parentNotifications/${student.rfid}`);
    
    const notificationListener = onValue(notificationsRef, async (snapshot) => {
      console.log('Real-time notification update received');
      
      try {
        const currentNotifications = [...notifications];
        
        const [parentNotifications, userActivities] = await Promise.all([
          loadParentNotifications(student.rfid!),
          user ? loadUserActivities(user.uid, student) : Promise.resolve([])
        ]);

        const seenKeys = new Set<string>();
        const deduplicated: ParentNotification[] = [];
        
        const allNotifications = [...parentNotifications, ...userActivities];
        
        for (const notification of allNotifications) {
          const uniqueKey = `${notification.timestamp}-${notification.type}-${notification.action}-${notification.studentName}`;
          
          if (!seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            deduplicated.push(notification);
          } else {
            console.log('Skipping duplicate notification:', uniqueKey);
          }
        }
        
        deduplicated.sort((a, b) => b.timestamp - a.timestamp);
        
        console.log('Total notifications after deduplication:', deduplicated.length);
        
        detectNewNotifications(deduplicated, currentNotifications);
        
        setNotifications(deduplicated);
        
        const newUnreadCount = calculateUnreadCount(deduplicated);
        setUnreadCount(newUnreadCount);
        
        // Sync badge count whenever notifications update
        await updateTabBadgeCount(newUnreadCount);
        
      } catch (error) {
        console.error('Error processing notifications:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      off(notificationsRef, 'value', notificationListener);
    };
  }, [user, notifications, loadParentNotifications, loadUserActivities, calculateUnreadCount, detectNewNotifications]);

  const markAsRead = async (notificationId: string) => {
    if (!student?.rfid) return;
    
    try {
      await update(ref(database, `parentNotifications/${student.rfid}/${notificationId}`), {
        read: true
      });
      
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId ? { ...notif, read: true } : notif
        )
      );
      
      if (newNotifications.has(notificationId)) {
        await markNotificationsAsSeen([notificationId]);
      }
      
      const newUnreadCount = Math.max(0, unreadCount - 1);
      setUnreadCount(newUnreadCount);
      
      // Sync badge count
      await updateTabBadgeCount(newUnreadCount);
      
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    if (!student?.rfid) return;
    
    try {
      const notificationToDelete = notifications.find(notif => notif.id === notificationId);
      
      if (!notificationToDelete) {
        console.log('Notification not found:', notificationId);
        return;
      }

      if (notificationToDelete.isActivity) {
        setDeletedActivities(prev => {
          const newSet = new Set(prev);
          newSet.add(notificationId);
          return newSet;
        });
        console.log('Activity log permanently deleted:', notificationId);
      } else {
        await remove(ref(database, `parentNotifications/${student.rfid}/${notificationId}`));
        
        setDeletedNotifications(prev => {
          const newSet = new Set(prev);
          newSet.add(notificationId);
          return newSet;
        });
        console.log('Notification permanently deleted from Firebase:', notificationId);
      }
      
      if (newNotifications.has(notificationId)) {
        await markNotificationsAsSeen([notificationId]);
      }
      
      await saveDeletedItems();
      
      setNotifications(prev => prev.filter(notif => notif.id !== notificationId));
      
      if (!notificationToDelete.read && !notificationToDelete.isActivity) {
        const newUnreadCount = Math.max(0, unreadCount - 1);
        setUnreadCount(newUnreadCount);
        await updateTabBadgeCount(newUnreadCount);
      }
      
    } catch (error) {
      console.error('Error deleting notification:', error);
      Alert.alert('Error', 'Failed to delete notification');
    }
  };

  const confirmDeleteNotification = (notificationId: string, notificationTitle: string) => {
    Alert.alert(
      'Delete Notification',
      `Are you sure you want to delete "${notificationTitle}"? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteNotification(notificationId),
        },
      ]
    );
  };

  const markAllAsRead = async () => {
    if (!student?.rfid) return;
    
    try {
      const updates: any = {};
      const unreadNotifications = notifications.filter(notif => !notif.read && !notif.isActivity);
      const newNotificationIds = notifications.filter(notif => notif.isNew).map(notif => notif.id);
      
      unreadNotifications.forEach(notification => {
        if (!deletedNotifications.has(notification.id)) {
          updates[`parentNotifications/${student.rfid}/${notification.id}/read`] = true;
        }
      });
      
      if (Object.keys(updates).length > 0) {
        await update(ref(database), updates);
        
        setNotifications(prev => prev.map(notif => ({
          ...notif,
          read: true,
          isNew: false
        })));
        
        if (newNotificationIds.length > 0) {
          await markNotificationsAsSeen(newNotificationIds);
        }
        
        setUnreadCount(0);
        
        // Sync badge count
        await updateTabBadgeCount(0);
        
        Alert.alert('Success', 'All notifications marked as read');
      } else {
        Alert.alert('Info', 'All notifications are already read');
      }
    } catch (error) {
      console.error('Error marking all as read:', error);
      Alert.alert('Error', 'Failed to mark all as read');
    }
  };

  const handleNotificationAction = (notification: ParentNotification) => {
    const actions = [];
    
    if (!notification.read && !notification.isActivity) {
      actions.push({
        text: 'Mark as Read',
        onPress: () => markAsRead(notification.id)
      });
    }
    
    actions.push({
      text: 'Delete',
      style: 'destructive' as const,
      onPress: () => confirmDeleteNotification(notification.id, notification.title || 'this notification')
    });
    
    actions.push(
      {
        text: 'View Details',
        onPress: () => viewNotificationDetails(notification)
      },
      {
        text: 'Cancel',
        style: 'cancel' as const
      }
    );

    Alert.alert('Notification Options', notification.message, actions);
  };

  const viewNotificationDetails = (notification: ParentNotification) => {
    const typeText = notification.isActivity ? 'Activity Log' : 'Notification';
    
    Alert.alert(
      notification.title || 'School Update',
      `${notification.message}\n\nTime: ${new Date(notification.timestamp).toLocaleString()}\nType: ${typeText}`,
      [{ text: 'OK' }]
    );
  };

  const getUnreadCount = () => {
    return unreadCount;
  };

  const getNewCount = () => {
    return calculateNewCount(notifications);
  };

  const loadAllData = useCallback(async (forceRefresh: boolean = false) => {
    if (!user || !student) return;
    
    const now = Date.now();
    if (!forceRefresh && now - lastRefreshTimeRef.current < 5000) {
      console.log('Too soon since last refresh, skipping');
      return;
    }
    
    if (isRefreshingRef.current) {
      console.log('Already refreshing, skipping');
      return;
    }

    try {
      isRefreshingRef.current = true;
      lastRefreshTimeRef.current = now;
      
      console.log('Loading all notification data...');
      const [parentNotifications, userActivities] = await Promise.all([
        loadParentNotifications(student.rfid!),
        loadUserActivities(user.uid, student)
      ]);

      const seenKeys = new Set<string>();
      const deduplicated: ParentNotification[] = [];
      
      const allNotifications = [...parentNotifications, ...userActivities];
      
      for (const notification of allNotifications) {
        let uniqueKey;
        // For pickup reminders, deduplicate and filter by time and scan status
        if (
          notification.type === 'reminder' ||
          notification.type === 'pickup_reminder_alert' ||
          notification.type === 'hourly_reminder_1230_2100'
        ) {
          // Only show reminders between 12:30 PM and 9:00 PM
          const notifDate = new Date(notification.timestamp);
          const hour = notifDate.getHours();
          const minute = notifDate.getMinutes();
          const isAfter1230 = hour > 12 || (hour === 12 && minute >= 30);
          const isBefore21 = hour < 21;
          // Check if scan has been recorded for pickup today (simple check: status !== 'Pending' or action !== 'pickup')
          let alreadyScanned = false;
          if (notification.status && notification.status.toLowerCase().includes('picked up')) {
            alreadyScanned = true;
          }
          if (isAfter1230 && isBefore21 && !alreadyScanned) {
            uniqueKey = `${notification.type}-${notification.action}-${notification.studentName}`;
            if (!seenKeys.has(uniqueKey)) {
              seenKeys.add(uniqueKey);
              deduplicated.push(notification);
            } else {
              console.log('Skipping duplicate notification:', uniqueKey);
            }
          } else {
            console.log('Skipping pickup reminder outside allowed time or already scanned:', notification);
          }
        } else {
          uniqueKey = `${notification.timestamp}-${notification.type}-${notification.action}-${notification.studentName}`;
          if (!seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            deduplicated.push(notification);
          } else {
            console.log('Skipping duplicate notification:', uniqueKey);
          }
        }
      }
      
      deduplicated.sort((a, b) => b.timestamp - a.timestamp);
      
      console.log('Total notifications after deduplication:', deduplicated.length);
      setNotifications(deduplicated);
      
      const newUnreadCount = calculateUnreadCount(deduplicated);
      setUnreadCount(newUnreadCount);
      
      // Sync badge count on initial load
      await updateTabBadgeCount(newUnreadCount);
      
      dataLoadedRef.current = true;
      
    } catch (error) {
      console.error('Error loading all data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      isRefreshingRef.current = false;
    }
  }, [user, student, loadParentNotifications, loadUserActivities, calculateUnreadCount]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        
        dataLoadedRef.current = false;
        
        if (notificationSetupRef.current) {
          console.log('Already setup, skipping re-initialization');
          return;
        }
        
        console.log('Setting up comprehensive notifications for user:', user.email);
        
        const studentData = await loadStudentData(user.email);
        if (studentData) {
          notificationSetupRef.current = true;
          setStudent(studentData);
          
          if (!dataLoadedRef.current) {
            await loadAllData(true);
          }
          
          const cleanup = setupNotificationListener(studentData);
          return cleanup;
        } else {
          setLoading(false);
          console.log('No student data found');
        }
      } else {
        setLoading(false);
        console.log('No user found');
      }
    });

    return () => {
      unsubscribe();
    };
  }, [loadStudentData, setupNotificationListener, loadAllData]);

  useFocusEffect(
    useCallback(() => {
      console.log('Notification screen focused');
      setIsScreenFocused(true);

      if (student && !dataLoadedRef.current) {
        console.log('Initial focus-based refresh triggered');
        markAllAsReadOnOpen();
        loadAllData(true);
      } else if (student) {
        console.log('Data already loaded, skipping refresh');
      }

      return () => {
        console.log('Notification screen unfocused');
        setIsScreenFocused(false);
      };
    }, [student, markAllAsReadOnOpen, loadAllData])
  );

  const onRefresh = useCallback(async () => {
    if (isRefreshingRef.current) {
      console.log('Already refreshing, skipping');
      return;
    }
    
    console.log('Manual refresh triggered');
    setRefreshing(true);
    await loadAllData(true);
  }, [loadAllData]);

  const BadgeCounter = ({ count }: { count: number }) => {
    if (count <= 0) return null;
    
    return (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>
          {count > 99 ? '99+' : count}
        </Text>
      </View>
    );
  };

  const NewNotificationBadge = () => {
    const newCount = getNewCount();
    if (newCount <= 0) return null;
    
    return (
      <View style={styles.newBadge}>
        <Text style={styles.newBadgeText}>
          {newCount > 99 ? '99+' : newCount}
        </Text>
      </View>
    );
  };

  const SwipeableNotificationItem = ({ item }: { item: ParentNotification }) => {
    const translateX = useRef(new Animated.Value(0)).current;
    const rowRef = useRef<any>(null);

    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > Math.abs(gestureState.dy * 2);
        },
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx < 0) {
            translateX.setValue(gestureState.dx);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < SWIPE_THRESHOLD) {
            Animated.timing(translateX, {
              toValue: -SCREEN_WIDTH,
              duration: SWIPE_OUT_DURATION,
              useNativeDriver: true,
            }).start(() => {
              confirmDeleteNotification(item.id, item.title || 'this notification');
              translateX.setValue(0);
            });
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          }
        },
      })
    ).current;

    const getIconName = () => {
      if (item.type === 'attendance_scan' || item.type === 'attendance_update' || item.message.includes('arrived') || item.message.includes('left')) {
        return item.message.includes('arrived') || item.action === 'Time In' ? 'school-outline' : 'exit-outline';
      }
      if (item.type === 'pickup_update' || item.type === 'manual_pickup_confirmation' || item.message.includes('picked up')) {
        return 'car-outline';
      }
      if (item.type === 'reminder' || item.type === 'hourly_reminder_1230_2100' || item.message.includes('Reminder')) {
        return 'notifications-outline';
      }
      if (item.type === 'admin_notification') {
        return 'megaphone-outline';
      }
      return 'notifications-outline';
    };

    const getIconColor = () => {
      if (item.type === 'attendance_scan' || item.type === 'attendance_update') {
        return item.status === 'Late' || item.message.includes('LATE') ? '#f59e0b' : '#10b981';
      }
      if (item.type === 'pickup_update' || item.type === 'manual_pickup_confirmation') {
        if (item.message.includes('PENDING') || item.status === 'Pending Verification') {
          return '#f59e0b';
        }
        return '#8b5cf6';
      }
      if (item.type === 'reminder' || item.type === 'hourly_reminder_1230_2100') {
        return '#f59e0b';
      }
      if (item.type === 'admin_notification') {
        return '#ef4444';
      }
      return '#6b7280';
    };

    const swipeDeleteBackground = () => {
      const opacity = translateX.interpolate({
        inputRange: [-SCREEN_WIDTH, -100, 0],
        outputRange: [1, 0.8, 0],
        extrapolate: 'clamp',
      });

      return (
        <Animated.View style={[styles.deleteBackground, { opacity }]}>
          <Ionicons name="trash-outline" size={24} color="#fff" />
          <Text style={styles.deleteText}>Delete</Text>
        </Animated.View>
      );
    };

    return (
      <View style={styles.swipeableContainer}>
        {swipeDeleteBackground()}
        <Animated.View
          ref={rowRef}
          style={{
            transform: [{ translateX }],
          }}
          {...panResponder.panHandlers}
        >
          <TouchableOpacity 
            style={[
              styles.notificationCard,
              !item.read && !item.isActivity && styles.unreadNotification,
              item.isNew && styles.newNotification
            ]}
            onPress={() => {
              if (item.isNew) {
                markNotificationsAsSeen([item.id]);
                setNotifications(prev => 
                  prev.map(notif => 
                    notif.id === item.id ? { ...notif, isNew: false } : notif
                  )
                );
              }
              handleNotificationAction(item);
            }}
            onLongPress={() => {
              confirmDeleteNotification(item.id, item.title || 'this notification');
            }}
          >
            <LinearGradient
              colors={item.isNew ? ['#EFF6FF', '#DBEAFE'] : ['#FFFFFF', '#F8FAFF']}
              style={styles.cardGradient}
            >
              <View style={styles.notificationHeader}>
                <View style={styles.notificationIconContainer}>
                  <Ionicons 
                    name={getIconName()} 
                    size={20} 
                    color={getIconColor()} 
                  />
                  {item.isNew && (
                    <View style={styles.newDot} />
                  )}
                </View>
                <View style={styles.notificationContent}>
                  <View style={styles.titleContainer}>
                    <Text style={[
                      styles.notificationTitle,
                      item.isNew && styles.newNotificationTitle
                    ]}>{item.title}</Text>
                    {item.isNew && (
                      <View style={styles.newIndicator}>
                        <Text style={styles.newIndicatorText}>New</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.notificationMessage}>{item.message}</Text>
                  <View style={styles.notificationFooter}>
                    <Text style={styles.notificationTime}>{item.displayTime}</Text>
                    {!item.read && !item.isActivity && (
                      <View style={styles.unreadIndicator} />
                    )}
                  </View>
                </View>
                <Ionicons 
                  name="chevron-back" 
                  size={16} 
                  color="#d1d5db" 
                  style={styles.swipeHintIcon}
                />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  };

  const EnhancedEmptyState = () => (
    <View style={styles.emptyContainer}>
      <LinearGradient
        colors={['#f8fafc', '#e2e8f0']}
        style={styles.emptyGradient}
      >
        <View style={styles.emptyIconContainer}>
          <Ionicons name="notifications-off-outline" size={80} color="#cbd5e1" />
        </View>
        <Text style={styles.emptyTitle}>No notifications yet</Text>
        <Text style={styles.emptyText}>
          You're all caught up! Here's what you'll see here:
        </Text>
        <View style={styles.featureList}>
          <View style={styles.featureItem}>
            <View style={[styles.featureIcon, { backgroundColor: '#10b98120' }]}>
              <Ionicons name="school-outline" size={16} color="#10b981" />
            </View>
            <Text style={styles.featureText}>School arrival & departure updates</Text>
          </View>
          <View style={styles.featureItem}>
            <View style={[styles.featureIcon, { backgroundColor: '#8b5cf620' }]}>
              <Ionicons name="car-outline" size={16} color="#8b5cf6" />
            </View>
            <Text style={styles.featureText}>Pickup notifications & reminders</Text>
          </View>
          <View style={styles.featureItem}>
            <View style={[styles.featureIcon, { backgroundColor: '#f59e0b20' }]}>
              <Ionicons name="time-outline" size={16} color="#f59e0b" />
            </View>
            <Text style={styles.featureText}>Late arrival alerts</Text>
          </View>
          <View style={styles.featureItem}>
            <View style={[styles.featureIcon, { backgroundColor: '#06b6d420' }]}>
              <Ionicons name="checkmark-done-outline" size={16} color="#06b6d4" />
            </View>
            <Text style={styles.featureText}>Manual pickup confirmations</Text>
          </View>
          <View style={styles.featureItem}>
            <View style={[styles.featureIcon, { backgroundColor: '#ef444420' }]}>
              <Ionicons name="trash-outline" size={16} color="#ef4444" />
            </View>
            <Text style={styles.featureText}>Swipe left to permanently delete</Text>
          </View>
        </View>
        <View style={styles.emptyFooter}>
          <Text style={styles.noteText}>
            All school updates appear here in one place
          </Text>
        </View>
      </LinearGradient>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <LinearGradient colors={['#1999e8', '#1488d0']} style={styles.header}>
          <View style={styles.headerContent}>
            <View>
              <Text style={styles.headerTitle}>Notifications</Text>
              <Text style={styles.headerSubtitle}>
                Loading your updates...
              </Text>
            </View>
          </View>
        </LinearGradient>
        <View style={styles.loadingContainer}>
          <View style={styles.loadingSpinner}>
            <Ionicons name="refresh" size={32} color="#1999e8" />
          </View>
          <Text style={styles.loadingText}>Loading your notifications...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      <LinearGradient colors={['#1999e8', '#1488d0']} style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.headerTitleSection}>
            <Text style={styles.headerTitle}>Notifications</Text>
            <Text style={styles.headerSubtitle}>
              Stay updated with school activities
            </Text>
          </View>
          
          <View style={styles.headerActions}>
            {notifications.length > 0 && (
              <>
                <NewNotificationBadge />
                {unreadCount > 0 && (
                  <TouchableOpacity 
                    style={styles.markAllButton}
                    onPress={markAllAsRead}
                  >
                    <Ionicons name="checkmark-done" size={20} color="#fff" />
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>
      </LinearGradient>

      <FlatList
        data={notifications}
        renderItem={({ item }) => <SwipeableNotificationItem item={item} />}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.listContent,
          notifications.length === 0 && styles.emptyListContent
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1999e8']}
            tintColor="#1999e8"
          />
        }
        ListEmptyComponent={<EnhancedEmptyState />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 25,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitleSection: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markAllButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  newBadge: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  swipeableContainer: {
    position: 'relative',
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  deleteBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    flexDirection: 'row',
    gap: 8,
  },
  deleteText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  notificationCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  unreadNotification: {
    borderLeftWidth: 4,
    borderLeftColor: '#1999e8',
  },
  newNotification: {
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  cardGradient: {
    padding: 16,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  notificationIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  newDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#dc2626',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  notificationContent: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E293B',
    flex: 1,
  },
  newNotificationTitle: {
    fontWeight: '900',
    color: '#1e40af',
  },
  newIndicator: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  newIndicatorText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  notificationMessage: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 8,
    lineHeight: 20,
  },
  notificationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notificationTime: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  unreadIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  swipeHintIcon: {
    marginLeft: 8,
    marginTop: 4,
    transform: [{ rotate: '180deg' }],
    opacity: 0.6,
  },
  emptyContainer: {
    flex: 1,
    padding: 20,
  },
  emptyGradient: {
    flex: 1,
    borderRadius: 20,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  featureList: {
    width: '100%',
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  featureText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
    fontWeight: '500',
  },
  emptyFooter: {
    marginTop: 16,
  },
  noteText: {
    fontSize: 13,
    color: '#10b981',
    textAlign: 'center',
    fontStyle: 'italic',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingSpinner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
});

export default NotificationScreen;