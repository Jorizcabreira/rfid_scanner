import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from "expo-router";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { get, push, ref, set, update } from 'firebase/database';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

import { auth, database } from '../firebaseConfig';

const { width, height } = Dimensions.get('window');

// Session management constants
const SESSION_KEYS = {
  USER_SESSION: 'parent_user_session',
  SESSION_TIMESTAMP: 'parent_session_timestamp',
  PARENT_UID: 'parent_uid_data'
};

// Session timeout (8 hours)
const SESSION_TIMEOUT = 8 * 60 * 60 * 1000;

// Security constants
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_MINUTE = 5;

// OTP Server URL - set to deployed Render URL
const OTP_SERVER_URL = 'https://rfid-scanner-1.onrender.com';

// Simple emoji-based icon component
const Icon = ({ name, size = 20, color = '#888', style }: any) => {
  const getIconChar = (iconName: string) => {
    const icons: { [key: string]: string } = {
      'key': '🔑',
      'mail': '📧',
      'lock': '🔒',
      'eye': '👁️',
      'eye-off': '👁️‍🗨️',
      'check': '✅',
      'help-circle': '❓',
      'book': '📖',
      'info': 'ℹ️',
      'logout': '🚪',
      'close': '✕'
    };
    return icons[iconName] || '○';
  };

  return (
    <Text style={[{ fontSize: size, color }, style]}>
      {getIconChar(name)}
    </Text>
  );
};

const ParentLoginScreen = () => {
  const [email, setEmail] = useState('');
  const [parentUid, setParentUid] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Safely parse fetch response bodies. If response isn't valid JSON, return
  // an object with success=false and the raw text in message to avoid parse errors.
  const parseResponseSafe = useCallback(async (response: Response) => {
    let text = '';
    try {
      text = await response.text();
    } catch (e) {
      return { success: false, message: `Unable to read response body: ${String(e)}` };
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      return { success: false, message: text || `Unexpected response (status ${response.status})` };
    }
  }, []);
  const [isAccountLocked, setIsAccountLocked] = useState(false);
  const [lockoutTimeRemaining, setLockoutTimeRemaining] = useState(0);
  
  // OTP States
  const [showOTPInput, setShowOTPInput] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpExpiry, setOtpExpiry] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [parentName, setParentName] = useState('');
  
  // Forgot Password States
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetParentUid, setResetParentUid] = useState('');
  const [showResetOTP, setShowResetOTP] = useState(false);
  const [resetOtp, setResetOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [resetOtpTimer, setResetOtpTimer] = useState(0);
  
  const isMountedRef = useRef(true);
  const loginAttemptRef = useRef(false);
  const authStateListenerRef = useRef<any>(null);
  const failedAttemptsRef = useRef<Map<string, number>>(new Map());
  const lockoutTimersRef = useRef<Map<string, number>>(new Map());
  const rateLimitRef = useRef<Map<string, {count: number, timestamp: number}>>(new Map());
  const otpTimerRef = useRef<any>(null);
  const resendTimerRef = useRef<any>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (authStateListenerRef.current) {
        authStateListenerRef.current();
      }
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
    };
  }, []);

  // Security: Rate limiting check
  const checkRateLimit = useCallback((identifier: string): boolean => {
    const now = Date.now();
    const rateData = rateLimitRef.current.get(identifier);

    if (!rateData) {
      rateLimitRef.current.set(identifier, { count: 1, timestamp: now });
      return true;
    }

    const timeDiff = now - rateData.timestamp;

    // Reset counter if window expired
    if (timeDiff > RATE_LIMIT_WINDOW) {
      rateLimitRef.current.set(identifier, { count: 1, timestamp: now });
      return true;
    }

    // Check if exceeded limit
    if (rateData.count >= MAX_REQUESTS_PER_MINUTE) {
      return false;
    }

    // Increment counter
    rateLimitRef.current.set(identifier, { 
      count: rateData.count + 1, 
      timestamp: rateData.timestamp 
    });
    return true;
  }, []);

  // Security: Check if account is locked
  const checkAccountLock = useCallback(async (identifier: string): Promise<boolean> => {
    const lockoutTime = lockoutTimersRef.current.get(identifier);
    
    if (!lockoutTime) {
      return false;
    }

    const now = Date.now();
    const remainingTime = lockoutTime - now;

    if (remainingTime <= 0) {
      // Lockout expired
      lockoutTimersRef.current.delete(identifier);
      failedAttemptsRef.current.delete(identifier);
      setIsAccountLocked(false);
      setLockoutTimeRemaining(0);
      return false;
    }

    // Still locked
    setIsAccountLocked(true);
    setLockoutTimeRemaining(Math.ceil(remainingTime / 1000));
    return true;
  }, []);

  // Security: Track failed login attempts
  const trackFailedAttempt = useCallback(async (identifier: string) => {
    const attempts = (failedAttemptsRef.current.get(identifier) || 0) + 1;
    failedAttemptsRef.current.set(identifier, attempts);

    console.log(`🔒 Failed attempt #${attempts} for ${identifier}`);

    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      const lockUntil = Date.now() + LOCKOUT_DURATION;
      lockoutTimersRef.current.set(identifier, lockUntil);
      setIsAccountLocked(true);
      setLockoutTimeRemaining(LOCKOUT_DURATION / 1000);

      // Store lockout in AsyncStorage for persistence
      try {
        await AsyncStorage.setItem(
          `lockout_${identifier}`,
          JSON.stringify({ lockUntil, attempts })
        );
      } catch (error) {
        console.error('Error storing lockout:', error);
      }

      return true;
    }

    return false;
  }, []);

  // Security: Reset failed attempts on successful login
  const resetFailedAttempts = useCallback(async (identifier: string) => {
    failedAttemptsRef.current.delete(identifier);
    lockoutTimersRef.current.delete(identifier);
    setIsAccountLocked(false);
    setLockoutTimeRemaining(0);

    try {
      await AsyncStorage.removeItem(`lockout_${identifier}`);
    } catch (error) {
      console.error('Error removing lockout:', error);
    }
  }, []);

  // Security: Load lockout status on mount
  useEffect(() => {
    const loadLockoutStatus = async () => {
      if (!parentUid) return;

      try {
        const lockoutData = await AsyncStorage.getItem(`lockout_${parentUid}`);
        if (lockoutData) {
          const { lockUntil, attempts } = JSON.parse(lockoutData);
          const now = Date.now();

          if (lockUntil > now) {
            lockoutTimersRef.current.set(parentUid, lockUntil);
            failedAttemptsRef.current.set(parentUid, attempts);
            await checkAccountLock(parentUid);
          } else {
            await AsyncStorage.removeItem(`lockout_${parentUid}`);
          }
        }
      } catch (error) {
        console.error('Error loading lockout status:', error);
      }
    };

    loadLockoutStatus();
  }, [parentUid, checkAccountLock]);

  // Security: Update lockout timer countdown
  useEffect(() => {
    if (!isAccountLocked || lockoutTimeRemaining <= 0) return;

    const timer = setInterval(() => {
      setLockoutTimeRemaining(prev => {
        if (prev <= 1) {
          setIsAccountLocked(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAccountLocked, lockoutTimeRemaining]);

  // Security: Input sanitization
  const sanitizeInput = useCallback((input: string): string => {
    return input.trim().replace(/[<>\"']/g, '');
  }, []);

  // Security: Enhanced email validation
  const validateEmail = useCallback((email: string): boolean => {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const sanitized = sanitizeInput(email);
    
    // Additional checks
    if (sanitized.length > 254) return false; // Max email length
    if (sanitized.includes('..')) return false; // No consecutive dots
    if (sanitized.startsWith('.') || sanitized.endsWith('.')) return false;
    
    return emailRegex.test(sanitized);
  }, [sanitizeInput]);

  // Security: Enhanced parentUid validation
  const validateParentUid = useCallback((uid: string): boolean => {
    const sanitized = sanitizeInput(uid);
    
    // Check for valid format (alphanumeric, dashes, underscores)
    const uidRegex = /^[a-zA-Z0-9_-]{3,50}$/;
    return uidRegex.test(sanitized);
  }, [sanitizeInput]);

  // Security: Password strength validation
  const validatePasswordStrength = useCallback((password: string): { valid: boolean, message: string } => {
    if (password.length < 6) {
      return { valid: false, message: 'Password must be at least 6 characters' };
    }
    
    if (password.length > 128) {
      return { valid: false, message: 'Password is too long' };
    }

    // Check for common weak passwords
    const weakPasswords = ['password', '123456', 'password123', 'qwerty', 'admin'];
    if (weakPasswords.includes(password.toLowerCase())) {
      return { valid: false, message: 'Password is too weak. Please choose a stronger password.' };
    }

    return { valid: true, message: '' };
  }, []);

  // Safe state setter
  const safeSetLoading = useCallback((loading: boolean) => {
    if (isMountedRef.current) {
      setIsLoading(loading);
    }
  }, []);

  // Session management functions
  const storeSessionData = useCallback(async (userData: any) => {
    try {
      const sessionData = {
        user: userData,
        timestamp: Date.now(),
        parentUid: parentUid,
        email: email
      };
      await AsyncStorage.setItem(SESSION_KEYS.USER_SESSION, JSON.stringify(sessionData));
      console.log('✅ Session data stored');
    } catch (error) {
      console.error('Error storing session data:', error);
    }
  }, [parentUid, email]);

  const clearSessionData = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove([
        SESSION_KEYS.USER_SESSION,
        SESSION_KEYS.SESSION_TIMESTAMP,
        SESSION_KEYS.PARENT_UID
      ]);
      console.log('✅ Session data cleared');
    } catch (error) {
      console.error('Error clearing session data:', error);
    }
  }, []);

  const getSessionData = useCallback(async () => {
    try {
      const sessionData = await AsyncStorage.getItem(SESSION_KEYS.USER_SESSION);
      if (!sessionData) return null;

      const parsedData = JSON.parse(sessionData);
      const now = Date.now();
      
      // Check if session is expired
      if (now - parsedData.timestamp > SESSION_TIMEOUT) {
        await clearSessionData();
        return null;
      }

      return parsedData;
    } catch (error) {
      console.error('Error getting session data:', error);
      return null;
    }
  }, [clearSessionData]);

  // Check for existing session on app start
  useEffect(() => {
    const checkExistingSession = async () => {
      if (!isMountedRef.current) return;

      try {
        const sessionData = await getSessionData();
        
        if (sessionData && auth.currentUser) {
          console.log('🟢 Session check: sessionData found:', sessionData);
          console.log('🟢 Session check: auth.currentUser:', auth.currentUser);
          console.log('✅ Existing valid session found, redirecting to home...');
          router.replace('/home');
        } else if (sessionData && !auth.currentUser) {
          console.log('🔴 Session check: sessionData exists but auth.currentUser is null. Clearing session.');
          // Session data exists but no auth user - clear invalid session
          await clearSessionData();
        }
      } catch (error) {
        console.error('Error checking session:', error);
      } finally {
        if (isMountedRef.current) {
          setIsCheckingSession(false);
        }
      }
    };

    checkExistingSession();
  }, [getSessionData, clearSessionData]);

  // Auth state listener for automatic session management
  useEffect(() => {
    authStateListenerRef.current = onAuthStateChanged(auth, async (user) => {
      if (!isMountedRef.current) return;

      if (user) {
        console.log('👤 User authenticated:', user.email);
        // User is signed in, ensure session data is stored
        const sessionData = await getSessionData();
        if (!sessionData) {
          await storeSessionData(user);
        }
      } else {
        console.log('👤 No user authenticated');
        // User is signed out, clear session data
        await clearSessionData();
      }
    });

    return () => {
      if (authStateListenerRef.current) {
        authStateListenerRef.current();
      }
    };
  }, [storeSessionData, clearSessionData, getSessionData]);

  // Handle back button press - prevent going back if logged in
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (auth.currentUser) {
        // If user is logged in, don't allow going back to login
        return true;
      }
      return false;
    });

    return () => backHandler.remove();
  }, []);

  // Function to log login attempts
  const logLoginAttempt = useCallback(async (logData: {
    parentUid: string;
    email: string;
    status: 'success' | 'failed' | 'suspicious';
    reason?: string;
    attempts?: number;
    device?: string;
  }) => {
    if (!isMountedRef.current) return true;

    try {
      const auditLogRef = ref(database, "parentLoginLog");
      const newLogRef = push(auditLogRef);
      
      const logEntry = {
        action: 'Parent Login Attempt',
        user: logData.email,
        device: logData.device || 'Mobile App',
        timestamp: Date.now(),
        details: logData.reason || 'Parent login attempt via mobile app',
        status: logData.status,
        parentUid: logData.parentUid,
        type: "parent_login"
      };

      await set(newLogRef, logEntry);
      console.log(`✅ Login attempt logged: ${logData.status}`);
      return true;
    } catch (error: any) {
      console.error('Error logging login attempt:', error);
      return true;
    }
  }, []);

  // Function to verify parent credentials
  const verifyParentCredentials = useCallback(async (uid: string, userEmail: string) => {
    if (!isMountedRef.current) return null;

    try {
      const studentsRef = ref(database, "students");
      const snapshot = await get(studentsRef);

      if (!snapshot.exists()) {
        console.log("No students found in database");
        return null;
      }

      const students = snapshot.val();
      const searchUid = uid.trim();
      const searchEmail = userEmail.trim().toLowerCase();
      
      console.log("🔍 Searching for parent UID:", searchUid);
      console.log("🔍 Searching for email:", searchEmail);

      for (const studentId in students) {
        const student = students[studentId];
        
        if (student.guardians) {
          // Handle both array and object guardians
          const guardiansList = Array.isArray(student.guardians) 
            ? student.guardians 
            : Object.values(student.guardians);
          
          console.log(`   Checking student: ${student.name || student.firstName} (${studentId})`);
          console.log(`   Guardians found: ${guardiansList.length}`);
          
          for (const guardian of guardiansList) {
            const guardianRfid = (guardian.rfid || guardian.parentUid || guardian.parentRfid || '').toString().trim();
            const guardianEmail = (guardian.email || guardian.Email || '').toLowerCase().trim();
            const guardianName = guardian.name || guardian.Name || 'Unknown';
            
            console.log(`     • Guardian: ${guardianName}`);
            console.log(`       UID: "${guardianRfid}"`);
            console.log(`       Email: "${guardianEmail}"`);
            
            // Exact match comparison
            const uidMatch = guardianRfid === searchUid;
            const emailMatch = guardianEmail === searchEmail;
            
            console.log(`       UID Match: ${uidMatch}`);
            console.log(`       Email Match: ${emailMatch}`);
            
            if (uidMatch && emailMatch) {
              console.log("✅ ✅ ✅ PARENT CREDENTIALS MATCHED!");
              console.log({
                studentId,
                studentName: student.name || student.firstName,
                guardianName: guardianName,
                guardianEmail: guardian.email || guardian.Email,
                guardianRfid: guardianRfid
              });
              return { 
                studentId, 
                student, 
                guardian,
                loginEmail: guardian.email || guardian.Email
              };
            }
          }
        }
      }
      
      console.log("❌ No matching parent credentials found after checking all students");
      return null;
    } catch (error: any) {
      console.error("Error verifying parent credentials:", error);
      return null;
    }
  }, []);

  // Function to handle manual logout
  const handleManualLogout = useCallback(async () => {
    if (!isMountedRef.current) return;

    safeSetLoading(true);
    try {
      // Clear push tokens from Firebase before logging out
      const user = auth.currentUser;
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
      await clearSessionData();
      console.log('✅ User manually logged out');
      
      // Clear form fields
      setEmail('');
      setParentUid('');
      setPassword('');
      setAcceptedTerms(false);
      
      Alert.alert('Logged Out', 'You have been successfully logged out.', [
        { text: 'OK', style: 'default' as const }
      ]);
    } catch (error: any) {
      console.error('Logout error:', error);
      Alert.alert('Logout Error', 'There was an error logging out. Please try again.');
    } finally {
      safeSetLoading(false);
    }
  }, [clearSessionData, safeSetLoading]);

  // Function to show Child Protection Policy
  const showChildProtectionPolicy = useCallback(() => {
    Alert.alert(
      'School Child Protection Policy',
      `HOSEA CHRISTIAN MISSION SCHOOL\nChild Protection and Anti-Bullying Policies\n\nWe are devoted to provide a caring, friendly and safe environment for all of our pupils so they can learn in a positive and secure atmosphere. Bullying of any kind is unacceptable in our school.\n\nIf bullying does occur, all pupils should be able to tell and know that incidents will be dealt with promptly and effectively.\n\nAs a school, we will aim to respond promptly and effectively to all issues of bullying and abuse.`,
      [
        { text: 'Read Data Privacy', onPress: showDataPrivacy, style: 'default' as const },
        { text: 'I Understand', style: 'default' as const }
      ]
    );
  }, []);

  // Function to show Data Privacy
  const showDataPrivacy = useCallback(() => {
    Alert.alert(
      'Data Privacy and Confidentiality',
      `Data Privacy and Confidentiality Policy:\n\nIn compliance with the Data Privacy Act of 2012:\n\n• All personal information of students and parents are protected and used only for educational purposes.\n\n• We maintain strict confidentiality in all proceedings.\n\n• Access to student records is limited to authorized school personnel only.\n\n• Parents have the right to access and correct their personal information.`,
      [
        { text: 'Back to Child Protection', onPress: showChildProtectionPolicy, style: 'default' as const },
        { text: 'I Understand', style: 'default' as const }
      ]
    );
  }, [showChildProtectionPolicy]);

  const validateForm = useCallback(() => {
    // Sanitize inputs first
    const sanitizedUid = sanitizeInput(parentUid);
    const sanitizedEmail = sanitizeInput(email);

    if (!sanitizedUid || sanitizedUid === '') {
      Alert.alert('Error', 'Please enter your Parent RFID UID', [{ text: 'OK', style: 'default' as const }]);
      return false;
    }

    // Validate Parent UID format
    if (!validateParentUid(sanitizedUid)) {
      Alert.alert('Invalid Format', 'Parent RFID UID contains invalid characters or format', [{ text: 'OK', style: 'default' as const }]);
      return false;
    }
    
    if (!sanitizedEmail || sanitizedEmail === '') {
      Alert.alert('Error', 'Please enter your email address', [{ text: 'OK', style: 'default' as const }]);
      return false;
    }
    
    // Enhanced email validation
    if (!validateEmail(sanitizedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address', [{ text: 'OK', style: 'default' as const }]);
      return false;
    }
    
    if (!password) {
      Alert.alert('Error', 'Please enter your password', [{ text: 'OK', style: 'default' as const }]);
      return false;
    }

    // Validate password strength
    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      Alert.alert('Weak Password', passwordCheck.message, [{ text: 'OK', style: 'default' as const }]);
      return false;
    }

    if (!acceptedTerms) {
      Alert.alert('Acceptance Required', 'Please accept the Child Protection Policy and Data Privacy Policy to continue.', [{ text: 'OK', style: 'default' as const }]);
      return false;
    }
    
    return true;
  }, [parentUid, email, password, acceptedTerms, sanitizeInput, validateParentUid, validateEmail, validatePasswordStrength]);

  // OTP: Send OTP to email
  const sendOTP = useCallback(async () => {
    if (!validateForm()) return;
    
    const sanitizedEmail = sanitizeInput(email);
    const sanitizedUid = sanitizeInput(parentUid);
    
    safeSetLoading(true);
    setLoadingMessage('Verifying credentials...');
    
    try {
      console.log("🔍 Verifying parent credentials...");
      console.log("Parent UID:", sanitizedUid);
      console.log("Email:", sanitizedEmail);
      
      // Verify credentials first
      const parentVerification = await verifyParentCredentials(sanitizedUid, sanitizedEmail);
      
      if (!parentVerification) {
        console.log("❌ Parent verification failed");
        safeSetLoading(false);
        Alert.alert(
          'Invalid Credentials', 
          'Parent UID and email combination not found.\n\nPlease check:\n• Parent RFID UID is correct\n• Email matches the one registered\n• Contact school admin if issue persists'
        );
        return;
      }
      
      console.log("✅ Parent verification successful");
      
      // Get parent name for email
      const name = parentVerification.guardian?.name || parentVerification.guardian?.Name || 'Parent';
      setParentName(name);
      
      setLoadingMessage('Sending OTP email...');
      console.log("📧 Sending OTP to:", sanitizedEmail);
      
      // Use Railway OTP Server URL
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      let response;
      try {
        response = await fetch(`${OTP_SERVER_URL}/api/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: sanitizedEmail,
            parentUid: sanitizedUid,
            parentName: name
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        console.error('❌ Fetch error:', fetchError);
        
        if (fetchError.name === 'AbortError') {
          throw new Error('Email server is taking too long to respond. Please try again in a moment.');
        }
        throw new Error('Cannot connect to email server. Please check your internet connection.');
      }
      
      const result = await parseResponseSafe(response);
      
      if (result.success) {
        setOtpSent(true);
        setShowOTPInput(true);
        setOtpExpiry(300); // 5 minutes
        setResendCooldown(60); // 1 minute cooldown
        
        // Start OTP expiry timer
        otpTimerRef.current = setInterval(() => {
          setOtpExpiry(prev => {
            if (prev <= 1) {
              clearInterval(otpTimerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        
        // Start resend cooldown timer
        resendTimerRef.current = setInterval(() => {
          setResendCooldown(prev => {
            if (prev <= 1) {
              clearInterval(resendTimerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        
        console.log('✅ OTP sent successfully to:', sanitizedEmail);
      } else {
        Alert.alert('Error', result.message || 'Failed to send OTP. Please try again.');
      }
    } catch (error: any) {
      console.error('Error sending OTP:', error);
      Alert.alert('Error', error.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoadingMessage('');
      safeSetLoading(false);
    }
  }, [email, parentUid, validateForm, sanitizeInput, verifyParentCredentials, safeSetLoading]);
  
  // OTP: Verify OTP and login
  const verifyOTPAndLogin = useCallback(async () => {
    if (!otp || otp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter a valid 6-digit OTP code.');
      return;
    }
    
    const sanitizedUid = sanitizeInput(parentUid);
    const sanitizedEmail = sanitizeInput(email);
    const identifier = `${sanitizedUid}_${sanitizedEmail}`;
    
    safeSetLoading(true);
    setLoadingMessage('Verifying OTP...');
    
    try {
      // Verify OTP with Railway server
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      let response;
      try {
        response = await fetch(`${OTP_SERVER_URL}/api/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: sanitizedEmail,
            otp: otp
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        console.error('❌ OTP verification fetch error:', fetchError);
        
        if (fetchError.name === 'AbortError') {
          throw new Error('Server timeout. Please try again.');
        }
        throw new Error('Cannot connect to server. Please check your internet connection.');
      }
      
      const result = await parseResponseSafe(response);
      
      if (!result.success) {
        safeSetLoading(false);
        setLoadingMessage('');
        Alert.alert('Invalid OTP', result.message || 'The OTP code you entered is incorrect.');
        return;
      }
      
      // OTP verified, proceed with login
      console.log("✅ OTP verified successfully");
      
      setLoadingMessage('Logging in...');
      
      const parentVerification = await verifyParentCredentials(sanitizedUid, sanitizedEmail);
      const loginEmail = parentVerification?.loginEmail || sanitizedEmail;
      
      console.log('🔐 Signing in with Firebase...');
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, password);
      const user = userCredential.user;
      
      console.log('💾 Saving session data...');
      // Reset failed attempts
      await resetFailedAttempts(identifier);
      await storeSessionData(user);
      console.log('🟢 After login: auth.currentUser:', auth.currentUser);
      const sessionDataAfterLogin = await getSessionData();
      console.log('🟢 After login: sessionData:', sessionDataAfterLogin);
      
      await logLoginAttempt({
        parentUid: sanitizedUid,
        email: loginEmail,
        status: 'success',
        reason: 'Successful parent login with OTP verification',
        device: 'Mobile App'
      });
      
      // Clear timers
      if (otpTimerRef.current) clearInterval(otpTimerRef.current);
      if (resendTimerRef.current) clearInterval(resendTimerRef.current);
      
      console.log('✅ Login successful, navigating to home...');
      setLoadingMessage('');
      safeSetLoading(false);
      
      router.replace("/home");
    } catch (error: any) {
      console.error('OTP verification error:', error);
      Alert.alert('Login Failed', error.message || 'Failed to complete login. Please try again.');
    } finally {
      setLoadingMessage('');
      safeSetLoading(false);
    }
  }, [otp, email, parentUid, password, sanitizeInput, verifyParentCredentials, resetFailedAttempts, storeSessionData, logLoginAttempt, safeSetLoading]);

  // Login function with OTP enabled
  const handleLogin = useCallback(async () => {
    if (loginAttemptRef.current) return;
    if (!validateForm()) return;

    // OTP ENABLED - Send OTP to email
    await sendOTP();
  }, [validateForm, sendOTP]);
  
  // Forgot Password: Send Reset OTP
  const sendResetOTP = useCallback(async () => {
    if (!resetEmail.trim() || !resetParentUid.trim()) {
      Alert.alert('Error', 'Please enter your email and Parent RFID UID');
      return;
    }

    safeSetLoading(true);
    setLoadingMessage('Verifying account...');

    try {
      // More flexible verification - check if email OR UID exists in database
      const studentsRef = ref(database, "students");
      const snapshot = await get(studentsRef);

      if (!snapshot.exists()) {
        Alert.alert('Error', 'No student records found in database.');
        safeSetLoading(false);
        return;
      }

      const students = snapshot.val();
      const searchUid = resetParentUid.trim();
      const searchEmail = resetEmail.toLowerCase().trim();
      
      let foundGuardian: any = null;
      let foundByEmail = false;
      let foundByUid = false;

      // Search for guardian by email OR UID
      for (const studentId in students) {
        const student = students[studentId];
        
        if (student.guardians) {
          const guardiansList = Array.isArray(student.guardians) 
            ? student.guardians 
            : Object.values(student.guardians);
          
          for (const guardian of guardiansList) {
            const guardianRfid = (guardian.rfid || guardian.parentUid || guardian.parentRfid || '').toString().trim();
            const guardianEmail = (guardian.email || guardian.Email || '').toLowerCase().trim();
            
            // Check if EITHER email OR UID matches
            const emailMatches = guardianEmail === searchEmail;
            const uidMatches = guardianRfid === searchUid;
            
            if (emailMatches || uidMatches) {
              foundGuardian = guardian;
              foundByEmail = emailMatches;
              foundByUid = uidMatches;
              
              // If both match, that's perfect - stop searching
              if (emailMatches && uidMatches) {
                console.log('✅ Perfect match: Both email and UID match');
                break;
              }
            }
          }
          
          if (foundGuardian && foundByEmail && foundByUid) break;
        }
      }

      if (!foundGuardian) {
        Alert.alert(
          'Account Not Found', 
          'No guardian account found with the provided email or Parent RFID UID.\n\nPlease check your details and try again, or contact school administration.'
        );
        safeSetLoading(false);
        return;
      }

      // Warn if only partial match
      if (foundByEmail && !foundByUid) {
        Alert.alert(
          'Partial Match',
          'Email found but Parent RFID UID does not match.\n\nWe will send the reset code to the email, but please verify your Parent RFID UID is correct.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => safeSetLoading(false) },
            { text: 'Continue', onPress: () => sendResetCodeToEmail() }
          ]
        );
        return;
      } else if (foundByUid && !foundByEmail) {
        Alert.alert(
          'Partial Match',
          'Parent RFID UID found but email does not match.\n\nPlease check that you entered the correct email address registered with your account.',
          [{ text: 'OK', onPress: () => safeSetLoading(false) }]
        );
        return;
      }

      // Both match - proceed to send reset code
      await sendResetCodeToEmail();

      async function sendResetCodeToEmail() {
        try {
          setLoadingMessage('Sending reset code to your email...');

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds

          console.log('📧 Sending password reset OTP to:', searchEmail);
          
          let response;
          try {
            response = await fetch(`${OTP_SERVER_URL}/api/send-otp`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                email: searchEmail,
                parentUid: searchUid,
                parentName: foundGuardian?.name || 'Parent',
                type: 'password-reset'
              }),
              signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
          } catch (fetchError: any) {
            clearTimeout(timeoutId);
            
            if (fetchError.name === 'AbortError') {
              throw new Error('Email server is taking too long to respond. Please try again in a moment.');
            }
            
            throw new Error('Cannot connect to email server. Please check your internet connection.');
          }

          const result = await parseResponseSafe(response);

          if (!result.success) {
            throw new Error(result.message || 'Failed to send reset code');
          }

          console.log('✅ Password reset OTP sent successfully');
          
          Alert.alert('Reset Code Sent', `A 6-digit password reset code has been sent to ${resetEmail}\n\nPlease check your email and enter the code.`);
          setShowResetOTP(true);
          setResetOtpTimer(300); // 5 minutes for password reset
          
          // Start countdown timer
          const interval = setInterval(() => {
            setResetOtpTimer((prev) => {
              if (prev <= 1) {
                clearInterval(interval);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);

          safeSetLoading(false);
        } catch (error: any) {
          console.error('❌ Reset OTP send error:', error);
          
          let errorMessage = 'Failed to send reset code. Please try again.';
          
          if (error.message.includes('server is taking too long')) {
            errorMessage = error.message;
          } else if (error.message.includes('Cannot connect')) {
            errorMessage = error.message;
          } else if (error.message) {
            errorMessage = error.message;
          }
          
          Alert.alert('Failed to Send Reset Code', errorMessage);
          safeSetLoading(false);
        }
      }

    } catch (error: any) {
      console.error('Reset OTP error:', error);
      Alert.alert('Error', error.message || 'Failed to send reset code. Please try again.');
    } finally {
      setLoadingMessage('');
      safeSetLoading(false);
    }
  }, [resetEmail, resetParentUid, safeSetLoading]);

  const togglePasswordVisibility = useCallback(() => {
    setShowPassword(prev => !prev);
  }, []);

  const toggleAcceptedTerms = useCallback(() => {
    setAcceptedTerms(prev => !prev);
  }, []);

  // Show loading screen while checking session
  if (isCheckingSession) {
    return (
      <View style={styles.fullScreenContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#1999e8" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Checking session...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.fullScreenContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#1999e8" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Section with Gradient Background */}
          <LinearGradient
            colors={['#1999e8', '#1488d0', '#0e77c0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerSection}
          >
            {/* Animated Background Circles */}
            <View style={styles.circle1} />
            <View style={styles.circle2} />
            <View style={styles.circle3} />
            <View style={styles.headerContent}>
              // ...existing code...
              <Text style={styles.titleText}>Parent Portal</Text>
              <Text style={styles.subtitleText}>Secure Access to Your Child's Progress</Text>
              
              {/* Show current login status */}
              {auth.currentUser && (
                <View style={styles.loggedInBadge}>
                  <Text style={styles.loggedInText}>
                    Currently logged in as: {auth.currentUser.email}
                  </Text>
                  <TouchableOpacity 
                    style={styles.logoutButton}
                    onPress={handleManualLogout}
                    disabled={isLoading}
                  >
                    <Icon name="logout" size={14} color="#fff" />
                    <Text style={styles.logoutText}>Logout</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </LinearGradient>
          
          {/* Form Section with Glassmorphism */}
          <View style={styles.formSection}>
            <View style={styles.glassCard}>
            {/* Security Warning - Account Locked */}
            {isAccountLocked && (
              <View style={styles.securityWarning}>
                <Text style={styles.securityWarningIcon}>🔒</Text>
                <Text style={styles.securityWarningTitle}>Account Temporarily Locked</Text>
                <Text style={styles.securityWarningText}>
                  Too many failed login attempts.{'\n'}
                  Please wait {Math.ceil(lockoutTimeRemaining / 60)} minute(s) before trying again.
                </Text>
              </View>
            )}

            {/* Parent RFID UID */}
            <View style={styles.inputContainer}>
              <Icon name="key" size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                placeholder="Parent RFID UID"
                placeholderTextColor="#888"
                style={styles.input}
                value={parentUid}
                onChangeText={setParentUid}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
            </View>
            
            <Text style={styles.helperText}>
              Enter the Parent RFID UID assigned by the school
            </Text>
            
            {/* Email */}
            <View style={styles.inputContainer}>
              <Icon name="mail" size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                placeholder="Registered email address"
                placeholderTextColor="#888"
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
            </View>
            
            <Text style={styles.helperText}>
              Use the email address associated with your Parent UID
            </Text>
            
            {/* Password */}
            <View style={styles.inputContainer}>
              <Icon name="lock" size={20} color="#888" style={styles.inputIcon} />
              <TextInput
                placeholder="Password"
                placeholderTextColor="#888"
                secureTextEntry={!showPassword}
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                editable={!isLoading}
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity 
                onPress={togglePasswordVisibility} 
                style={styles.eyeIcon}
                disabled={isLoading}
              >
                <Icon name={showPassword ? "eye-off" : "eye"} size={20} color="#888" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.helperText}>
              Password created by school administration
            </Text>

            {/* Forgot Password Button */}
            <TouchableOpacity 
              style={[styles.forgotPasswordButton, isLoading && styles.buttonDisabled]}
              onPress={() => setShowForgotPassword(true)}
              disabled={isLoading}
            >
              <Icon name="help-circle" size={16} color="#e0f7ff" />
              <Text style={styles.forgotPasswordText}>Forgot your password? Reset it here</Text>
            </TouchableOpacity>

            {/* Terms and Conditions Checkbox */}
            <View style={styles.termsContainer}>
              <TouchableOpacity 
                style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}
                onPress={toggleAcceptedTerms}
                disabled={isLoading}
              >
                {acceptedTerms && <Icon name="check" size={16} color="#fff" />}
              </TouchableOpacity>
              <Text style={styles.termsText}>
                I have read and agree to the{' '}
                <Text style={styles.termsLink} onPress={showChildProtectionPolicy}>
                  Child Protection Policy
                </Text>{' '}
                and{' '}
                <Text style={styles.termsLink} onPress={showDataPrivacy}>
                  Data Privacy Policy
                </Text>
              </Text>
            </View>
            
            {/* Login Button */}
            <LinearGradient
              colors={['#1999e8', '#0e77c0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.button, isLoading && styles.buttonDisabled]}
            >
              <TouchableOpacity 
                style={styles.buttonInner}
                onPress={handleLogin}
                disabled={isLoading}
              >
                {isLoading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator size="small" color="#fff" />
                    {loadingMessage ? (
                      <Text style={styles.buttonText}>{loadingMessage}</Text>
                    ) : null}
                  </View>
                ) : (
                  <>
                    <Text style={styles.buttonText}>LOGIN TO PARENT PORTAL</Text>
                    <Text style={styles.buttonIcon}>→</Text>
                  </>
                )}
              </TouchableOpacity>
            </LinearGradient>
            
            {/* Help Text */}
            <View style={styles.helpContainer}>
              <Text style={styles.helpText}>
                Need help with your Parent UID or email?{'\n'}
                Contact school administration for assistance.{'\n\n'}
                <Text style={styles.securityNote}>
                  Your session will remain active for 8 hours or until you manually logout.
                </Text>
              </Text>
            </View>

            // ...existing code...
            </View>
            
            {/* Decorative Footer */}
            <View style={styles.decorativeFooter}>
              <View style={styles.footerDot} />
              <View style={styles.footerLine} />
              <View style={styles.footerDot} />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* OTP Modal - Centered popup overlay */}
      <Modal
        visible={showOTPInput}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOTPInput(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Close Button */}
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowOTPInput(false)}
            >
              <Icon name="close" size={24} color="#666" />
            </TouchableOpacity>

            {/* OTP Header */}
            <View style={styles.otpHeader}>
              <Text style={styles.otpTitle}>📧 Email Verification</Text>
              {otpExpiry > 0 && (
                <Text style={styles.otpTimer}>
                  ⏱️ {Math.floor(otpExpiry / 60)}:{(otpExpiry % 60).toString().padStart(2, '0')}
                </Text>
              )}
            </View>
            
            {/* OTP Instruction */}
            <Text style={styles.otpInstruction}>
              A 6-digit code was sent to {email}
            </Text>
            
            {/* OTP Input */}
            <View style={styles.inputContainer}>
              <Text style={[styles.inputIcon, { fontSize: 20 }]}>🔢</Text>
              <TextInput
                placeholder="Enter 6-digit OTP"
                placeholderTextColor="#aaa"
                keyboardType="number-pad"
                maxLength={6}
                style={styles.input}
                value={otp}
                onChangeText={setOtp}
                editable={!isLoading && otpExpiry > 0}
                autoFocus={true}
              />
            </View>
            
            {/* OTP Actions */}
            <View style={styles.otpActions}>
              <TouchableOpacity 
                style={[styles.verifyOtpButton, isLoading && styles.buttonDisabled]} 
                onPress={verifyOTPAndLogin}
                disabled={isLoading || otp.length !== 6 || otpExpiry === 0}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.verifyOtpButtonText}>✓ Verify & Login</Text>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.resendOtpButton, (resendCooldown > 0 || isLoading) && styles.buttonDisabled]} 
                onPress={sendOTP}
                disabled={resendCooldown > 0 || isLoading}
              >
                <Text style={styles.resendOtpButtonText}>
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : '🔄 Resend OTP'}
                </Text>
              </TouchableOpacity>
            </View>
            
            {/* OTP Expired Message */}
            {otpExpiry === 0 && (
              <Text style={styles.otpExpiredText}>
                ⚠️ OTP expired. Please request a new one.
              </Text>
            )}
          </View>
        </View>
      </Modal>

      {/* Forgot Password Modal */}
      <Modal
        visible={showForgotPassword}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowForgotPassword(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Close Button */}
            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => {
                setShowForgotPassword(false);
                setShowResetOTP(false);
                setResetEmail('');
                setResetParentUid('');
                setResetOtp('');
                setNewPassword('');
                setConfirmNewPassword('');
              }}
            >
              <Text style={{ fontSize: 24 }}>✕</Text>
            </TouchableOpacity>

            {!showResetOTP ? (
              <>
                {/* Step 1: Enter Email and Parent UID */}
                <Text style={styles.otpTitle}>🔐 Reset Password</Text>
                <Text style={styles.otpInstruction}>
                  Enter your email and Parent RFID UID to receive a reset code
                </Text>

                <View style={styles.inputContainer}>
                  <Text style={[styles.inputIcon, { fontSize: 20 }]}>📧</Text>
                  <TextInput
                    placeholder="Email Address"
                    placeholderTextColor="#aaa"
                    style={styles.input}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!isLoading}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={[styles.inputIcon, { fontSize: 20 }]}>🔑</Text>
                  <TextInput
                    placeholder="Parent RFID UID"
                    placeholderTextColor="#aaa"
                    style={styles.input}
                    value={resetParentUid}
                    onChangeText={setResetParentUid}
                    editable={!isLoading}
                  />
                </View>

                <TouchableOpacity 
                  style={[styles.verifyOtpButton, isLoading && styles.buttonDisabled]} 
                  onPress={sendResetOTP}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.verifyOtpButtonText}>Send Reset Code</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Step 2: Enter OTP and New Password */}
                <Text style={styles.otpTitle}>🔐 Enter Reset Code</Text>
                <Text style={styles.otpInstruction}>
                  Code sent to {resetEmail}
                  {resetOtpTimer > 0 && ` (${resetOtpTimer}s)`}
                </Text>

                <View style={styles.inputContainer}>
                  <Text style={[styles.inputIcon, { fontSize: 20 }]}>🔢</Text>
                  <TextInput
                    placeholder="6-digit code"
                    placeholderTextColor="#aaa"
                    keyboardType="number-pad"
                    maxLength={6}
                    style={styles.input}
                    value={resetOtp}
                    onChangeText={setResetOtp}
                    editable={!isLoading}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={[styles.inputIcon, { fontSize: 20 }]}>🔒</Text>
                  <TextInput
                    placeholder="New Password (min 6 characters)"
                    placeholderTextColor="#aaa"
                    secureTextEntry
                    style={styles.input}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    editable={!isLoading}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Text style={[styles.inputIcon, { fontSize: 20 }]}>🔒</Text>
                  <TextInput
                    placeholder="Confirm New Password"
                    placeholderTextColor="#aaa"
                    secureTextEntry
                    style={styles.input}
                    value={confirmNewPassword}
                    onChangeText={setConfirmNewPassword}
                    editable={!isLoading}
                  />
                </View>

                <TouchableOpacity 
                  style={[styles.verifyOtpButton, isLoading && styles.buttonDisabled]} 
                  onPress={() => {
                    // For now, just show message since password reset API needs to be implemented
                    Alert.alert(
                      'Feature Coming Soon',
                      'Password reset via OTP is currently being implemented. Please contact school administration for password reset.',
                      [{ text: 'OK' }]
                    );
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.verifyOtpButtonText}>Reset Password</Text>
                  )}
                </TouchableOpacity>

                {resetOtpTimer === 0 && (
                  <TouchableOpacity 
                    style={styles.resendOtpButton} 
                    onPress={sendResetOTP}
                    disabled={isLoading}
                  >
                    <Text style={styles.resendOtpButtonText}>🔄 Resend Code</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setShowResetOTP(false)}
                  disabled={isLoading}
                >
                  <Text style={styles.resendOtpButtonText}>← Back</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreenContainer: { 
    flex: 1, 
    backgroundColor: '#1999e8' 
  },
  keyboardAvoid: { 
    flex: 1 
  },
  scrollContainer: { 
    flexGrow: 1 
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1999e8',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 20,
  },
  headerSection: {
    height: height * 0.4,
    position: 'relative',
    overflow: 'hidden',
    paddingTop: StatusBar.currentHeight || 0,
  },
  circle1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    top: -60,
    right: -60,
    zIndex: 1,
  },
  circle2: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    top: -100,
    right: -100,
    zIndex: 0,
  },
  circle3: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    bottom: -40,
    left: -40,
    zIndex: 1,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  logoEmoji: {
    fontSize: 40,
  },
  headerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
    zIndex: 2,
  },
  titleText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 5,
  },
  subtitleText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    fontWeight: '300',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    marginBottom: 10,
  },
  loggedInBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  loggedInText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 5,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 15,
  },
  logoutText: {
    color: '#fff',
    fontSize: 12,
    marginLeft: 5,
    fontWeight: 'bold',
  },
  formSection: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingTop: 35,
    paddingHorizontal: 25,
    paddingBottom: 40,
    marginTop: -30,
    zIndex: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 10,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 25,
    padding: 25,
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  inputContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#fff', 
    borderRadius: 15, 
    width: '100%', 
    height: 55, 
    marginBottom: 12, 
    paddingHorizontal: 20,
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(25, 153, 232, 0.1)',
  },
  inputIcon: { 
    marginRight: 15,
    fontSize: 22,
  },
  input: { 
    flex: 1, 
    color: '#333', 
    fontSize: 16,
    fontWeight: '500',
  },
  eyeIcon: { 
    padding: 5 
  },
  helperText: { 
    color: '#1999e8', 
    fontSize: 12, 
    marginBottom: 18, 
    marginLeft: 12, 
    fontStyle: 'italic',
    fontWeight: '500',
  },
  forgotPasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    padding: 12,
    backgroundColor: 'rgba(25, 153, 232, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(25, 153, 232, 0.2)',
  },
  forgotPasswordText: {
    color: '#1999e8',
    fontSize: 13,
    marginLeft: 8,
    fontWeight: '600',
  },
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 25,
    paddingHorizontal: 5,
    backgroundColor: 'rgba(25, 153, 232, 0.05)',
    padding: 15,
    borderRadius: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#1999e8',
    borderRadius: 6,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    backgroundColor: '#1999e8',
    borderColor: '#1999e8',
  },
  termsText: {
    color: '#555',
    fontSize: 12,
    flex: 1,
    lineHeight: 18,
    fontWeight: '500',
  },
  termsLink: {
    color: '#1999e8',
    fontWeight: '700',
  },
  button: { 
    borderRadius: 15, 
    width: '100%', 
    shadowColor: '#1999e8', 
    shadowOffset: { width: 0, height: 6 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 10, 
    elevation: 8, 
    marginTop: 15,
    overflow: 'hidden',
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    width: '100%',
  },
  buttonDisabled: { 
    opacity: 0.6 
  },
  buttonText: { 
    color: '#fff', 
    fontSize: 16, 
    fontWeight: '700',
    letterSpacing: 1,
  },
  buttonIcon: {
    color: '#fff',
    fontSize: 20,
    marginLeft: 8,
    fontWeight: 'bold',
  },
  helpContainer: { 
    marginTop: 25, 
    padding: 18, 
    backgroundColor: 'rgba(25, 153, 232, 0.08)', 
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(25, 153, 232, 0.15)',
  },
  helpText: { 
    color: '#555', 
    fontSize: 13, 
    textAlign: 'center', 
    lineHeight: 20,
    fontWeight: '500',
  },
  securityNote: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#1999e8',
    fontWeight: '600',
  },
  securityWarning: {
    backgroundColor: '#ff6b6b',
    borderRadius: 20,
    padding: 20,
    marginBottom: 25,
    alignItems: 'center',
    shadowColor: '#ff6b6b',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  securityWarningIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  securityWarningTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  securityWarningText: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },
  // OTP Styles
  otpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  otpTitle: {
    color: '#1999e8',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  otpTimer: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: '#1999e8',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 15,
    overflow: 'hidden',
  },
  otpInstruction: {
    color: '#555',
    fontSize: 14,
    marginBottom: 18,
    textAlign: 'center',
    fontWeight: '500',
  },
  otpActions: {
    flexDirection: 'column',
    gap: 12,
    marginTop: 18,
  },
  verifyOtpButton: {
    backgroundColor: '#1a98d2ff',
    borderRadius: 15,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  verifyOtpButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  resendOtpButton: {
    backgroundColor: 'rgba(25, 153, 232, 0.15)',
    borderRadius: 15,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(25, 153, 232, 0.3)',
  },
  resendOtpButtonText: {
    color: '#1999e8',
    fontSize: 14,
    fontWeight: '700',
  },
  otpExpiredText: {
    color: '#fbbf24',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '600',
  },
  decorativeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 25,
    marginBottom: 10,
  },
  footerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(25, 153, 232, 0.4)',
  },
  footerLine: {
    width: 50,
    height: 2,
    backgroundColor: 'rgba(25, 153, 232, 0.2)',
    marginHorizontal: 10,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 30,
    padding: 30,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 15,
    borderWidth: 1,
    borderColor: 'rgba(25, 153, 232, 0.2)',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 1,
    padding: 8,
    backgroundColor: 'rgba(25, 153, 232, 0.1)',
    borderRadius: 20,
  },
  backButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  signupLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(25, 153, 232, 0.2)',
  },
  signupText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});

export default ParentLoginScreen;