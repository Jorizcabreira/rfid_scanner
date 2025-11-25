import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { get, onValue, orderByChild, push, query, ref, remove, set, update } from 'firebase/database';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

// ✅ FIREBASE IMPORTS
import { auth, database } from '../firebaseConfig';

// ✅ EXPO NOTIFICATIONS ONLY (React Native Firebase not compatible with Expo)
import * as Notifications from 'expo-notifications';

// ✅ CONFIGURE NOTIFICATIONS
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface Message {
  id: string;
  text: string;
  sender: 'parent' | 'teacher';
  timestamp: number;
  senderName: string;
  read: boolean;
  type?: 'text' | 'file';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  localUri?: string;
  notificationSent?: boolean;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
  photo?: string;
  subject?: string;
  gradeLevel?: string;
  section?: string;
}

interface Student {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  section: string;
  rfid?: string;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MessagesScreen = () => {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [parentName, setParentName] = useState('');
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMessageMenu, setShowMessageMenu] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fcmToken, setFcmToken] = useState<string>('');
  
  const flatListRef = useRef<FlatList<Message>>(null);
  const [error, setError] = useState<string | null>(null);

  // Store cleanup functions
  const cleanupRefs = useRef<(() => void)[]>([]);

  const emojis = ['😀', '😂', '🥰', '😎', '🤩', '😍', '👍', '❤️', '🔥', '🎉', '🙏', '💯'];

  // DEBUG: Log when messages state changes
  useEffect(() => {
    console.log('🔄 ============ MESSAGES STATE CHANGED ============');
    console.log('🔄 Messages count:', messages.length);
    console.log('🔄 Messages IDs:', messages.map(m => m.id));
    console.log('🔄 First 3 messages:', messages.slice(0, 3).map(m => ({
      id: m.id, 
      sender: m.sender, 
      text: m.text?.substring(0, 30)
    })));
    console.log('🔄 FlatList should now render', messages.length, 'messages');
  }, [messages]);

  // Keyboard listeners - scroll to bottom when keyboard appears
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => {
        console.log('⌨️ Keyboard opened - scrolling to bottom');
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );

    return () => {
      keyboardDidShowListener.remove();
    };
  }, []);

  // ==================== FCM NOTIFICATION SETUP ====================

  // Request Expo Push Notifications permissions and get token
  const requestFcmPermission = async (): Promise<boolean> => {
    try {
      console.log('🔔 Requesting push notification permissions...');
      
      const { status } = await Notifications.requestPermissionsAsync();
      const enabled = status === 'granted';

      console.log('Notification Authorization status:', status, 'Enabled:', enabled);

      if (enabled) {
        try {
          const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId: '15369961-bc79-4ea5-a604-b52f908a92ae'
          });
          const token = tokenData.data;
          console.log('✅ Expo Push Token obtained:', token.substring(0, 20) + '...');
          setFcmToken(token);
          
          // Try to store Expo Push token in database (optional - won't fail if permission denied)
          const user = auth.currentUser;
          if (user) {
            try {
              await update(ref(database, `users/${user.uid}`), {
                expoPushToken: token,
                tokenUpdated: Date.now()
              });
              console.log('✅ Expo Push token stored in database');
            } catch (dbError) {
              console.warn('⚠️ Could not save push token to database (permission denied):', dbError);
              // Continue anyway - token is still stored locally
            }
          }
          
          return true;
        } catch (tokenError) {
          console.warn('⚠️ Error getting push token (continuing anyway):', tokenError);
          // Continue without push notifications
          return false;
        }
      } else {
        console.log('❌ Push notification permission not granted');
        return false;
      }
    } catch (error) {
      console.warn('⚠️ Error in notification setup (continuing anyway):', error);
      return false;
    }
  };

  // Setup Expo Push Notification listeners
  const setupFcmListeners = () => {
    console.log('🔔 Setting up Expo Push Notification listeners...');

    // ✅ Handle notification responses (user taps notification)
    const notificationResponseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('📱 Notification tapped:', response.notification.request.content.data);
      handleNotificationTap(response.notification.request.content.data);
      
      // Refresh messages if it's a teacher message
      if (response.notification.request.content.data?.type === 'teacher_message' && selectedStudent) {
        console.log('🔄 Refreshing messages due to new teacher message');
        loadMessages(selectedStudent.id);
      }
    });

    // ✅ Handle notifications received while app is in foreground
    const notificationReceivedSubscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('📱 Notification received in foreground:', notification.request.content.data);
      
      // Refresh messages if it's a teacher message
      if (notification.request.content.data?.type === 'teacher_message' && selectedStudent) {
        console.log('🔄 Refreshing messages due to new teacher message');
        loadMessages(selectedStudent.id);
      }
    });

    // Store cleanup functions
    cleanupRefs.current.push(() => {
      notificationResponseSubscription.remove();
      notificationReceivedSubscription.remove();
    });
  };

  // Handle notification tap
  const handleNotificationTap = async (data: any) => {
    console.log('🔔 Handling notification tap:', data);
    if (data.type === 'teacher_message') {
      console.log('📱 Teacher message notification tapped - navigating to message screen and refreshing');
      // If studentId is present in notification data, use it to refresh messages
      if (data.studentId) {
        // Optionally, navigate to message screen if not already there
        if (router && typeof router.push === 'function') {
          router.push('/message');
        }
        // Mark teacher messages as read and reload messages for the student
        await markTeacherMessagesAsRead(data.studentId);
        const messagesRef = ref(database, `messages/${data.studentId}`);
        get(messagesRef).then(snapshot => {
          if (snapshot.exists()) {
            const messagesData = snapshot.val();
            const messagesArray: Message[] = [];
            for (const messageId in messagesData) {
              messagesArray.push({ id: messageId, ...messagesData[messageId] });
            }
            messagesArray.sort((a, b) => a.timestamp - b.timestamp);
            setMessages(messagesArray);
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: true });
            }, 300);
            console.log('✅ Messages refreshed from notification tap');
          }
        });
      }
    }
  };

  // ==================== BACK NAVIGATION HANDLER ====================
  const handleBackPress = () => {
    console.log('🔙 Back button pressed - navigating back to home');
    router.push('/(tabs)/home'); // ✅ Babalik sa home tab
  };

  // ==================== NOTIFICATION SETUP ====================

  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        console.log('🔔 Initializing notification system...');
        
        // Configure notification behavior
        await Notifications.setNotificationChannelAsync('messages', {
          name: 'Messages',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#1999e8',
          sound: 'default',
        });

        // Request FCM permissions (don't block if it fails)
        await requestFcmPermission();
        
        // Setup FCM listeners
        setupFcmListeners();

        console.log('✅ Notification system initialized successfully');

      } catch (error) {
        console.warn('⚠️ Error initializing notifications (continuing anyway):', error);
        // Don't block the app if notifications fail
      }
    };

    // Initialize notifications but don't wait for it
    initializeNotifications().catch(err => {
      console.warn('⚠️ Notification initialization failed:', err);
    });

    // Check initial notification (when app opened from notification)
    Notifications.getLastNotificationResponseAsync()
      .then(response => {
        if (response) {
          console.log('📱 App opened from message notification:', response.notification.request.content.data);
          handleNotificationTap(response.notification.request.content.data);
        }
      });

    return () => {
      console.log('🧹 Cleaning up notification listeners ONLY (not message listeners)');
      // Only cleanup notification listeners, not database listeners
    };
  }, []); // ← Remove selectedStudent dependency!

  // ==================== TEACHER MESSAGE LISTENER FOR PUSH NOTIFICATIONS ====================

  // Listen for teacher messages and send PUSH notifications (NOT storage notifications)
  const setupTeacherMessageListener = (studentId: string) => {
    console.log('🔔 Setting up teacher message push notification listener for student:', studentId);
    
    const messagesRef = ref(database, `messages/${studentId}`);
    const messagesQuery = query(messagesRef, orderByChild('timestamp'));

    let lastMessageTimestamp = Date.now(); // Track last message time to avoid duplicates

    const messageListener = onValue(messagesQuery, (snapshot) => {
      if (snapshot.exists()) {
        const messagesData = snapshot.val();
        const messagesArray: Message[] = [];

        for (const messageId in messagesData) {
          messagesArray.push({
            id: messageId,
            ...messagesData[messageId]
          });
        }

        // Sort by timestamp
        messagesArray.sort((a, b) => a.timestamp - b.timestamp);
        
        // Check for new teacher messages that arrived after we started listening
        const newTeacherMessages = messagesArray.filter(msg => 
          msg.sender === 'teacher' && 
          msg.timestamp > lastMessageTimestamp
        );

        if (newTeacherMessages.length > 0 && selectedStudent) {
          const latestMessage = newTeacherMessages[newTeacherMessages.length - 1];
          
          console.log('🔔 NEW TEACHER MESSAGE DETECTED - SENDING PUSH NOTIFICATION ONLY');
          console.log('Message timestamp:', latestMessage.timestamp);
          console.log('Last known timestamp:', lastMessageTimestamp);
          
          // Update last known timestamp
          lastMessageTimestamp = latestMessage.timestamp;

          // ✅ CRITICAL: Send PUSH notification ONLY - NO STORAGE in parentNotifications
          sendTeacherMessagePushNotification(latestMessage, selectedStudent, teacher);

          // Mark message as read in Firebase if app is open
          const messageRef = ref(database, `messages/${studentId}/${latestMessage.id}`);
          update(messageRef, { read: true });
        }

        setMessages(messagesArray);
      }
    });

    // ✅ FIXED: Proper cleanup using the returned unsubscribe function
    cleanupRefs.current.push(() => {
      console.log('🧹 Cleaning up teacher message listener');
      messageListener(); // Call the function to unsubscribe
    });
  };

  // ✅ NEW: Send PUSH notification for teacher messages (NO storage in notifications)
  const sendTeacherMessagePushNotification = async (message: Message, student: Student, teacher: Teacher | null) => {
    try {
      const teacherName = teacher?.name || 'Teacher';
      const studentName = `${student.firstName} ${student.lastName || ''}`.trim();
      
      console.log('🔔 Sending PUSH notification for teacher message');

      // Send push notification that will appear even when app is closed
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `💬 ${teacherName}`,
          body: message.text.substring(0, 100) + (message.text.length > 100 ? '...' : ''),
          data: {
            type: 'teacher_message',
            studentId: student.id,
            studentName: studentName,
            teacherName: teacherName,
            messageId: message.id,
            timestamp: Date.now(),
            // ✅ CRITICAL: This ensures it doesn't go to notification page
            isPushOnly: true
          },
          sound: true,
          badge: 1,
        },
        trigger: null,
      });

      console.log('✅ TEACHER MESSAGE PUSH NOTIFICATION SENT - WILL APPEAR AS POPUP');

    } catch (error) {
      console.error('❌ Error sending teacher message push notification:', error);
    }
  };

  // ==================== MESSAGE SCREEN ORIGINAL CODE ====================

  useEffect(() => {
    console.log('MessagesScreen mounted');
    const user = auth.currentUser;
    
    if (!user) {
      console.log('No user, redirecting to login');
      router.replace('/');
      return;
    }

    console.log('Current user:', user.email);
    loadData();

    // Cleanup function
    return () => {
      console.log('Cleaning up all listeners');
      cleanupRefs.current.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          console.error('Error during cleanup:', error);
        }
      });
      cleanupRefs.current = [];
    };
  }, []);

  const loadData = () => {
    setLoading(true);
    setError(null);
    const user = auth.currentUser;
    
    if (!user) return;

    console.log('Starting data load for user:', user.email);
    
    // Safety timeout: if data doesn't load in 10 seconds, stop loading
    const loadingTimeout = setTimeout(() => {
      console.warn('⚠️ Data loading timeout - forcing loading to stop');
      setLoading(false);
    }, 10000);

    // Load parent's name
    const parentRef = ref(database, `users/${user.uid}`);
    const parentUnsubscribe = onValue(parentRef, (snapshot) => {
      if (snapshot.exists()) {
        const userData = snapshot.val();
        setParentName(userData.firstName || userData.name || 'Parent');
        console.log('Parent name loaded:', userData.firstName || userData.name);
      } else {
        setParentName('Parent');
        console.log('No parent data found, using default name');
      }
    }, (error) => {
      console.warn('⚠️ Error loading parent data:', error);
      setParentName('Parent'); // Use default name
      // Don't stop loading - continue to load other data
    });

    cleanupRefs.current.push(parentUnsubscribe);

    // Find student linked to this parent
    const studentsRef = ref(database, 'students');
    const studentsUnsubscribe = onValue(studentsRef, (snapshot) => {
      console.log('Students data loaded, exists:', snapshot.exists());
      
      if (snapshot.exists()) {
        const studentsData = snapshot.val();
        let foundStudent: Student | null = null;

        for (const studentId in studentsData) {
          const student = studentsData[studentId];
          console.log('Checking student:', studentId, student.firstName);
          
          if (student.guardians) {
            const guardians = Array.isArray(student.guardians) 
              ? student.guardians 
              : Object.values(student.guardians);
            
            console.log('Student guardians:', guardians);
            
            const isLinked = guardians.some((guardian: any) => {
              const guardianEmail = guardian.email?.toLowerCase();
              const userEmail = user.email?.toLowerCase();
              console.log('Comparing emails:', guardianEmail, 'vs', userEmail);
              return guardianEmail === userEmail;
            });

            if (isLinked) {
              console.log('✅ Found linked student:', student.firstName);
              foundStudent = {
                id: studentId,
                firstName: student.firstName || 'Student',
                lastName: student.lastName || '',
                gradeLevel: student.gradeLevel || 'N/A',
                section: student.section || 'N/A',
                rfid: student.rfid || studentId
              };
              break;
            }
          }
        }

        if (foundStudent) {
          console.log('✅ ============ STUDENT FOUND ============');
          console.log('✅ Student ID:', foundStudent.id);
          console.log('✅ Student Name:', foundStudent.firstName, foundStudent.lastName);
          console.log('✅ Student Grade:', foundStudent.gradeLevel);
          console.log('✅ Student RFID:', foundStudent.rfid);
          console.log('✅ Now loading messages for this student...');
          
          setSelectedStudent(foundStudent);
          findTeacherByGradeLevel(foundStudent.gradeLevel);
          loadMessages(foundStudent.id, () => clearTimeout(loadingTimeout));
          // ✅ Setup teacher message listener for PUSH notifications only
          setupTeacherMessageListener(foundStudent.id);
        } else {
          console.log('❌ No linked student found for email:', user.email);
          setError(`No student found linked to your email (${user.email}). Please contact the school administrator.`);
          clearTimeout(loadingTimeout);
          setLoading(false);
          setSelectedStudent(null);
        }
      } else {
        console.log('❌ No students data found in database');
        setError('No student data available in the system.');
        clearTimeout(loadingTimeout);
        setLoading(false);
        setSelectedStudent(null);
      }
    }, (error) => {
      console.warn('⚠️ Error loading students:', error);
      setError('Failed to load student data. Please check your connection.');
      clearTimeout(loadingTimeout);
      setLoading(false);
    });

    cleanupRefs.current.push(studentsUnsubscribe);
  };

  const findTeacherByGradeLevel = (gradeLevel: string) => {
    console.log('Finding teacher for grade level:', gradeLevel);
    
    const usersRef = ref(database, 'users');
    const usersUnsubscribe = onValue(usersRef, (snapshot) => {
      if (snapshot.exists()) {
        const usersData = snapshot.val();
        let foundTeacher: Teacher | null = null;

        for (const userId in usersData) {
          const userData = usersData[userId];
          console.log('Checking user:', userId, userData.firstname, userData.gradeLevel);
          
          // ✅ FIXED: Better teacher identification logic
          if (userData.gradeLevel === gradeLevel && userData.role === 'teacher') {
            console.log('✅ Found matching teacher:', userData.firstname);
            foundTeacher = {
              id: userId,
              name: `${userData.firstname || ''} ${userData.middlename || ''} ${userData.lastname || ''}`.trim() || 'Teacher',
              email: userData.email || '',
              gradeLevel: userData.gradeLevel,
              subject: userData.subject || 'Class Teacher',
              section: userData.section || ''
            };
            break;
          }
        }

        if (foundTeacher) {
          console.log('✅ Setting teacher:', foundTeacher.name);
          setTeacher(foundTeacher);
        } else {
          console.log('ℹ️ No specific teacher found, creating generic one');
          setTeacher({
            id: 'general',
            name: `${gradeLevel} Teacher`,
            email: '',
            gradeLevel: gradeLevel,
            subject: 'Class Teacher'
          });
        }
      } else {
        console.log('❌ No users data found');
        setTeacher({
          id: 'general',
          name: `${gradeLevel} Teacher`,
          email: '',
          gradeLevel: gradeLevel,
          subject: 'Class Teacher'
        });
      }
    }, (error) => {
      console.warn('⚠️ Error finding teacher:', error);
      setTeacher({
        id: 'general',
        name: `${gradeLevel} Teacher`,
        email: '',
        gradeLevel: gradeLevel,
        subject: 'Class Teacher'
      });
    });

    cleanupRefs.current.push(usersUnsubscribe);
  };

  // Mark all unread teacher messages as read
  const markTeacherMessagesAsRead = async (studentId: string) => {
    try {
      console.log('👁️ Marking all teacher messages as read...');
      const messagesRef = ref(database, `messages/${studentId}`);
      const snapshot = await get(messagesRef);
      
      if (snapshot.exists()) {
        const messages = snapshot.val();
        const updates: { [key: string]: any } = {};
        
        for (const messageId in messages) {
          const message = messages[messageId];
          // Mark unread teacher messages as read
          if (message.sender === 'teacher' && !message.read) {
            updates[`messages/${studentId}/${messageId}/read`] = true;
            console.log('👁️ Marking message as read:', messageId);
          }
        }
        
        if (Object.keys(updates).length > 0) {
          await update(ref(database), updates);
          console.log('✅ Marked', Object.keys(updates).length, 'teacher messages as read');
        }
      }
    } catch (error) {
      console.warn('⚠️ Error marking messages as read:', error);
      // Don't block if this fails
    }
  };

  const loadMessages = (studentId: string, clearLoadingTimeout?: () => void) => {
    console.log('📨 ============ LOADING MESSAGES ============');
    console.log('📨 Student ID:', studentId);
    console.log('📨 Current messages count:', messages.length);
    console.log('📨 Firebase path:', `messages/${studentId}`);
    console.log('📨 Parent email:', auth.currentUser?.email);
    
    const messagesRef = ref(database, `messages/${studentId}`);
    const messagesQuery = query(messagesRef, orderByChild('timestamp'));
    
    console.log('📨 Attempting to listen to Firebase...');
    
    // Mark all teacher messages as read when opening the screen
    markTeacherMessagesAsRead(studentId);

    const messagesUnsubscribe = onValue(messagesQuery, (snapshot) => {
      console.log('📬 ============ SNAPSHOT RECEIVED ============');
      console.log('📬 Student ID:', studentId);
      console.log('📬 Snapshot exists:', snapshot.exists());
      console.log('📬 Snapshot key:', snapshot.key);
      
      if (snapshot.exists()) {
        const messagesData = snapshot.val();
        console.log('📬 Raw messages data:', JSON.stringify(messagesData).substring(0, 200));
        console.log('📬 Number of messages:', Object.keys(messagesData).length);
        
        const messagesArray: Message[] = [];

        for (const messageId in messagesData) {
          const message = messagesData[messageId];
          console.log('Processing message:', messageId, message.sender, message.text?.substring(0, 30));
          messagesArray.push({
            id: messageId,
            ...message
          });
        }

        // Sort by timestamp
        messagesArray.sort((a, b) => a.timestamp - b.timestamp);
        console.log('📬 ============ MESSAGES LOADED ============');
        console.log(`📬 Total messages: ${messagesArray.length}`);
        console.log('📬 First 5 messages:', messagesArray.slice(0, 5).map(m => ({
          id: m.id, 
          sender: m.sender, 
          text: m.text?.substring(0, 30),
          timestamp: new Date(m.timestamp).toLocaleString()
        })));
        console.log('📬 Calling setMessages() now...');
        
        setMessages(messagesArray);
        console.log('📬 setMessages() called! State should update.');

      } else {
        console.log('ℹ️ No messages found for student:', studentId);
        setMessages([]);
      }
      
      if (clearLoadingTimeout) clearLoadingTimeout();
      setLoading(false);
    }, (error) => {
      console.warn('⚠️ Error loading messages:', error);
      setError('Failed to load messages. Please check Firebase rules.');
      setMessages([]); // Show empty messages instead of stuck loading
      
      if (clearLoadingTimeout) clearLoadingTimeout();
      setLoading(false);
    });

    cleanupRefs.current.push(messagesUnsubscribe);
  };

  const sendMessage = async () => {
    if ((!newMessage.trim() && !editingMessage) || !selectedStudent) return;

    const messageText = newMessage.trim();
    const studentToSend = selectedStudent;
    const teacherToNotify = teacher;
    
    // Clear input IMMEDIATELY without waiting
    setNewMessage('');

    try {
      const user = auth.currentUser;
      if (!user) {
        setNewMessage(messageText); // Restore message if no user
        return;
      }

      let messageData: Omit<Message, 'id'>;

      if (editingMessage) {
        // Update existing message
        messageData = {
          ...editingMessage,
          text: messageText,
          timestamp: Date.now(),
        };

        const messageRef = ref(database, `messages/${studentToSend.id}/${editingMessage.id}`);
        await update(messageRef, { text: messageText, timestamp: Date.now() });
        console.log('✅ Message updated successfully');
        setEditingMessage(null);
      } else {
        // Send new message
        messageData = {
          text: messageText,
          sender: 'parent',
          timestamp: Date.now(),
          senderName: parentName,
          read: false,
          type: 'text'
        };

        console.log('Sending message to student:', studentToSend.id);
        const messagesRef = ref(database, `messages/${studentToSend.id}`);
        const newMessageRef = push(messagesRef);
        
        // Send message and notification in parallel for speed
        const sendPromises = [set(newMessageRef, messageData)];
        
        // Add teacher notification to parallel operations
        if (teacherToNotify && teacherToNotify.id) {
          const teacherNotificationRef = ref(database, `teacherNotifications/${teacherToNotify.id}`);
          const teacherNotification = push(teacherNotificationRef);
          
          sendPromises.push(set(teacherNotification, {
            type: 'parent_message',
            studentId: studentToSend.id,
            studentName: `${studentToSend.firstName} ${studentToSend.lastName}`,
            parentName: parentName,
            message: messageText,
            timestamp: Date.now(),
            read: false,
            gradeLevel: studentToSend.gradeLevel,
            section: studentToSend.section
          }));
        }
        
        // Execute all operations in parallel
        await Promise.all(sendPromises);
        console.log('✅ Message sent successfully');
      }
      
      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

    } catch (error: any) {
      console.error('❌ Error sending message:', error);
      setNewMessage(messageText); // Restore message on error
      
      if (error.code === 'PERMISSION_DENIED') {
        Alert.alert(
          'Permission Denied', 
          'Cannot send message. Please check Firebase Database Rules.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Failed to send message. Please try again.');
      }
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!selectedStudent) return;

    Alert.alert(
      'Delete Message',
      'Are you sure you want to delete this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const messageRef = ref(database, `messages/${selectedStudent.id}/${messageId}`);
              await remove(messageRef);
              console.log('✅ Message deleted successfully');
              setShowMessageMenu(null);
            } catch (error) {
              console.error('❌ Error deleting message:', error);
              Alert.alert('Error', 'Failed to delete message. Please try again.');
            }
          }
        }
      ]
    );
  };

  const startEditing = (message: Message) => {
    setEditingMessage(message);
    setNewMessage(message.text);
    setShowMessageMenu(null);
  };

  const cancelEditing = () => {
    setEditingMessage(null);
    setNewMessage('');
  };

  const addEmoji = (emoji: string) => {
    setNewMessage(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  // Pick document/file
  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await sendFileMessage(asset.uri, asset.name || 'document', asset.size || 0);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document. Please try again.');
    }
  };

  const getFileSize = async (fileUri: string): Promise<number> => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists && 'size' in fileInfo) {
        return (fileInfo as FileSystem.FileInfo & { size: number }).size || 0;
      }
      return 0;
    } catch (error) {
      console.error('Error getting file size:', error);
      return 0;
    }
  };

  // Send file message
  const sendFileMessage = async (fileUri: string, fileName: string, fileSize: number) => {
    if (!selectedStudent) return;

    setUploadingFile(true);
    try {
      const user = auth.currentUser;
      if (!user) return;

      const messageData: Omit<Message, 'id'> = {
        text: '📎 Sent a document',
        sender: 'parent',
        timestamp: Date.now(),
        senderName: parentName,
        read: false,
        type: 'file',
        fileUrl: fileUri,
        fileName: fileName,
        fileSize: fileSize,
        localUri: fileUri,
      };

      const messagesRef = ref(database, `messages/${selectedStudent.id}`);
      const newMessageRef = push(messagesRef);
      await set(newMessageRef, messageData);

      console.log('✅ File message sent successfully');

      // Scroll to bottom
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

    } catch (error: any) {
      console.error('❌ Error sending file message:', error);
      Alert.alert('Error', 'Failed to send file. Please try again.');
    } finally {
      setUploadingFile(false);
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return 'Unknown size';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    console.log('🎨 ============ RENDERING MESSAGE ============');
    console.log('🎨 Index:', index);
    console.log('🎨 Message ID:', item.id);
    console.log('🎨 Sender:', item.sender);
    console.log('🎨 Text:', item.text?.substring(0, 50));
    console.log('🎨 Timestamp:', new Date(item.timestamp).toLocaleString());
    
    const showDate = index === 0 || 
      formatDate(item.timestamp) !== formatDate(messages[index - 1]?.timestamp);

    const isParentMessage = item.sender === 'parent';

    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateText}>{formatDate(item.timestamp)}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[
            styles.messageContainer,
            isParentMessage ? styles.parentMessage : styles.teacherMessage
          ]}
          onLongPress={() => isParentMessage && setShowMessageMenu(item.id)}
          delayLongPress={300}
        >
          <View style={[
            styles.messageBubble,
            isParentMessage ? styles.parentBubble : styles.teacherBubble
          ]}>
            {item.type === 'file' && item.localUri ? (
              <TouchableOpacity 
                style={styles.fileContainer}
                onPress={() => {
                  Alert.alert(
                    'Document', 
                    `File: ${item.fileName}\nSize: ${formatFileSize(item.fileSize)}`,
                    [
                      { text: 'OK', style: 'default' },
                    ]
                  );
                }}
              >
                <Ionicons name="document-outline" size={32} color={isParentMessage ? '#fff' : '#1999e8'} />
                <View style={styles.fileInfo}>
                  <Text style={[
                    styles.fileName,
                    isParentMessage ? styles.parentText : styles.teacherText
                  ]} numberOfLines={1}>
                    {item.fileName}
                  </Text>
                  {item.fileSize && (
                    <Text style={[
                      styles.fileSize,
                      isParentMessage ? styles.parentText : styles.teacherText
                    ]}>
                      {formatFileSize(item.fileSize)}
                    </Text>
                  )}
                </View>
                <Ionicons name="download-outline" size={20} color={isParentMessage ? '#fff' : '#1999e8'} />
              </TouchableOpacity>
            ) : (
              <Text style={[
                styles.messageText,
                isParentMessage ? styles.parentText : styles.teacherText
              ]}>
                {item.text}
              </Text>
            )}
            <Text style={[
              styles.messageTime,
              isParentMessage ? styles.parentTime : styles.teacherTime
            ]}>
              {formatTime(item.timestamp)}
              {editingMessage?.id === item.id && ' (editing)'}
            </Text>
          </View>
          {!isParentMessage && !item.read && (
            <View style={styles.unreadIndicator} />
          )}
        </TouchableOpacity>

        {/* Message Menu Modal */}
        <Modal
          visible={showMessageMenu === item.id}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMessageMenu(null)}
        >
          <TouchableWithoutFeedback onPress={() => setShowMessageMenu(null)}>
            <View style={styles.menuOverlay}>
              <View style={styles.messageMenu}>
                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => startEditing(item)}
                >
                  <Ionicons name="create-outline" size={20} color="#1999e8" />
                  <Text style={styles.menuItemText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.menuItem, styles.deleteMenuItem]}
                  onPress={() => deleteMessage(item.id)}
                >
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  <Text style={[styles.menuItemText, styles.deleteMenuText]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    );
  };

  const handleRetry = () => {
    console.log('Retrying data load...');
    setError(null);
    setLoading(true);
    setMessages([]);
    setSelectedStudent(null);
    setTeacher(null);
    
    // Clear existing listeners
    cleanupRefs.current.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.error('Error during cleanup:', error);
      }
    });
    cleanupRefs.current = [];
    
    loadData();
  };

  if (loading) {
    return (
      <View style={styles.fullScreenContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#1999e8" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1999e8" />
          <Text style={styles.loadingText}>Loading messages...</Text>
          <Text style={styles.fcmStatus}>
            {fcmToken ? '✅ Notifications enabled' : '⏳ Setting up notifications...'}
          </Text>
          <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.fullScreenContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#1999e8" />
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={80} color="#d1d5db" />
          <Text style={styles.errorTitle}>Unable to Load Messages</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.debugText}>
            User: {auth.currentUser?.email}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Ionicons name="refresh" size={20} color="#fff" />
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!selectedStudent) {
    return (
      <View style={styles.fullScreenContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#1999e8" />
        <View style={styles.errorContainer}>
          <Ionicons name="person-outline" size={80} color="#d1d5db" />
          <Text style={styles.errorTitle}>No Student Linked</Text>
          <Text style={styles.errorText}>
            Your account is not linked to any student. Please contact the school administrator.
          </Text>
          <Text style={styles.debugText}>
            Current email: {auth.currentUser?.email}
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Ionicons name="refresh" size={20} color="#fff" />
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fullScreenContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#1999e8" />
      
      {/* HEADER */}
      <LinearGradient colors={['#1999e8', '#1488d0']} style={styles.header}>
        <View style={styles.headerContent}>
          {/* BACK BUTTON */}
          <TouchableOpacity 
            onPress={handleBackPress}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          
          <View style={styles.teacherInfo}>
            <LinearGradient colors={['#10b981', '#34d399']} style={styles.teacherAvatar}>
              <Ionicons name="person" size={20} color="#fff" />
            </LinearGradient>
            <View style={styles.teacherDetails}>
              <Text style={styles.teacherName}>
                {teacher?.name || `${selectedStudent.gradeLevel} Teacher`}
              </Text>
              <Text style={styles.teacherSubject}>
                {teacher?.gradeLevel || selectedStudent.gradeLevel} Teacher
                {selectedStudent.section && selectedStudent.section !== 'N/A' && ` • ${selectedStudent.section}`}
              </Text>
            </View>
          </View>
          
          {/* ✅ REMOVED REFRESH BUTTON - Messages auto-update in real-time */}
          <View style={styles.placeholderButton} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView 
        style={{flex: 1}}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.contentContainer}>
          {/* MESSAGES LIST */}
          <FlatList<Message>
          ref={flatListRef}
          data={messages}
          extraData={messages.length}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          style={styles.messagesList}
          contentContainerStyle={[
            styles.messagesContent,
            messages.length === 0 && styles.emptyMessagesContent
          ]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            console.log('📱 FlatList content size changed - scrolling to end');
            flatListRef.current?.scrollToEnd({ animated: true });
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="chatbubble-ellipses-outline" size={60} color="#d1d5db" />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyText}>
                Start a conversation with {teacher?.name || 'the teacher'}
              </Text>
              <Text style={styles.notificationHint}>
                🔔 Teacher messages will appear as push notifications
              </Text>
            </View>
          }
        />

        {/* Editing Indicator */}
        {editingMessage && (
          <View style={styles.editingIndicator}>
            <Text style={styles.editingText}>Editing message</Text>
            <TouchableOpacity onPress={cancelEditing}>
              <Ionicons name="close" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}

        {/* Message Input */}
        <View style={styles.inputContainer}>
          {/* File Picker Button */}
          <TouchableOpacity 
            style={styles.attachmentButton}
            onPress={pickDocument}
            disabled={uploadingFile}
          >
            <Ionicons name="document-outline" size={24} color="#1999e8" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.attachmentButton}
            onPress={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Ionicons name="happy-outline" size={24} color="#1999e8" />
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder={editingMessage ? "Edit your message..." : "Type your message..."}
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={500}
            onFocus={() => {
              // Scroll to bottom when input is focused
              setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
              }, 100);
            }}
          />
          
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!newMessage.trim() || uploadingFile) && styles.sendButtonDisabled
            ]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || uploadingFile}
          >
            {uploadingFile ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Emoji Picker */}
        <Modal
          visible={showEmojiPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowEmojiPicker(false)}
        >
          <View style={styles.emojiPickerContainer}>
            <View style={styles.emojiPicker}>
              <View style={styles.emojiPickerHeader}>
                <Text style={styles.emojiPickerTitle}>Choose an emoji</Text>
                <TouchableOpacity onPress={() => setShowEmojiPicker(false)}>
                  <Ionicons name="close" size={24} color="#374151" />
                </TouchableOpacity>
              </View>
              <View style={styles.emojiGrid}>
                {emojis.map((emoji, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.emojiButton}
                    onPress={() => addEmoji(emoji)}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </Modal>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreenContainer: { 
    flex: 1, 
    backgroundColor: '#1999e8'
  },
  contentContainer: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 30,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 10,
  },
  fcmStatus: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
    marginBottom: 20,
    textAlign: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#f8fafc',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 10,
  },
  debugText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  retryButton: {
    backgroundColor: '#1999e8',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 10,
    letterSpacing: 0.3,
  },
  // HEADER - Enhanced Modern Design
  header: {
    paddingTop: 60,
    paddingBottom: 25,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
  },
  teacherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 12,
  },
  teacherAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  teacherDetails: {
    flex: 1,
  },
  teacherName: {
    fontSize: 19,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  teacherSubject: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    marginBottom: 2,
    fontWeight: '500',
  },
  notificationStatus: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
  },
  placeholderButton: {
    width: 40,
  },
  messagesList: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  messagesContent: {
    padding: 16,
    backgroundColor: '#f1f5f9',
  },
  emptyMessagesContent: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 20,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    overflow: 'hidden',
  },
  messageContainer: {
    marginVertical: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  parentMessage: {
    justifyContent: 'flex-end',
  },
  teacherMessage: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 14,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  parentBubble: {
    backgroundColor: '#1999e8',
    borderBottomRightRadius: 6,
  },
  teacherBubble: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  parentText: {
    color: '#ffffff',
    fontWeight: '500',
  },
  teacherText: {
    color: '#1e293b',
    fontWeight: '500',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 6,
    fontWeight: '500',
  },
  parentTime: {
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'right',
  },
  teacherTime: {
    color: '#94a3b8',
  },
  unreadIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    marginLeft: 6,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#fff',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
    backgroundColor: '#f1f5f9',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 20,
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  emptyText: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '500',
  },
  notificationHint: {
    fontSize: 13,
    color: '#10b981',
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 16,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  attachmentButton: {
    padding: 10,
    marginRight: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    maxHeight: 100,
    fontSize: 16,
    color: '#1e293b',
    marginRight: 12,
    fontWeight: '500',
  },
  sendButton: {
    backgroundColor: '#1999e8',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  sendButtonDisabled: {
    backgroundColor: '#cbd5e1',
    shadowOpacity: 0,
  },
  // Message Menu Styles - Enhanced
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageMenu: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
  },
  deleteMenuItem: {
    marginTop: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  menuItemText: {
    marginLeft: 14,
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  deleteMenuText: {
    color: '#ef4444',
  },
  // Editing Indicator - Enhanced
  editingIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#fbbf24',
  },
  editingText: {
    fontSize: 14,
    color: '#92400e',
    fontWeight: '600',
    fontStyle: 'italic',
  },
  // File Message Styles - Enhanced
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
  },
  fileInfo: {
    flex: 1,
    marginHorizontal: 12,
  },
  fileName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.8,
  },
  // Emoji Picker Styles - Enhanced
  emojiPickerContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  emojiPicker: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '45%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
  },
  emojiPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
  },
  emojiPickerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: 0.3,
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  emojiButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    margin: 4,
    backgroundColor: '#f8fafc',
  },
  emojiText: {
    fontSize: 28,
  },
});

export default MessagesScreen;
