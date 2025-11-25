import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { get, ref, set } from 'firebase/database';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { auth, database } from '../firebaseConfig';

const { width, height } = Dimensions.get('window');

// Simple emoji-based icon component
const Icon = ({ name, size = 20, color = '#888', style }: any) => {
  const getIconChar = (iconName: string) => {
    const icons: { [key: string]: string } = {
      'mail': '📧',
      'lock': '🔒',
      'eye': '👁️',
      'eye-off': '👁️‍🗨️',
    };
    return icons[iconName] || '○';
  };

  return (
    <Text style={[{ fontSize: size, color }, style]}>
      {getIconChar(name)}
    </Text>
  );
};

/**
 * PARENT SIGNUP IS NOW DISABLED
 * 
 * All parent accounts must be created by school administrators through the web portal.
 * This ensures proper verification and security.
 * 
 * Parents should contact the school administration to:
 * 1. Register their information
 * 2. Receive their Parent RFID UID
 * 3. Get their account credentials
 * 
 * Self-service password reset is available through the login screen.
 */

const ParentSignUpScreen = () => {
  // Redirect to login page immediately
  React.useEffect(() => {
    Alert.alert(
      'Account Creation Disabled',
      'Parent accounts must be created by school administrators.\n\nPlease contact the school administration to create your account.',
      [
        { 
          text: 'Go to Login', 
          onPress: () => router.replace('/') 
        }
      ]
    );
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validateForm = () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return false;
    }

    if (!password) {
      Alert.alert('Error', 'Please enter a password');
      return false;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return false;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return false;
    }

    return true;
  };

  const handleSignUp = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    setLoadingMessage('Verifying your email...');

    try {
      const normalizedEmail = email.toLowerCase().trim();

      // ✅ FIRST: Check if this email was registered by admin in students data
      setLoadingMessage('Checking registration...');
      const studentsSnapshot = await get(ref(database, 'students'));
      const students = studentsSnapshot.val();
      
      let isRegisteredByAdmin = false;
      let studentData = null;
      let parentInfo = null;

      if (students) {
        // Search through all students to find if this email is in any guardian
        for (const studentKey in students) {
          const student = students[studentKey];
          if (student.guardians && Array.isArray(student.guardians)) {
            for (const guardian of student.guardians) {
              if (guardian.email && guardian.email.toLowerCase() === normalizedEmail) {
                isRegisteredByAdmin = true;
                studentData = { ...student, rfid: studentKey };
                parentInfo = guardian;
                break;
              }
            }
          }
          if (isRegisteredByAdmin) break;
        }
      }

      // If email is not registered by admin, reject signup
      if (!isRegisteredByAdmin) {
        Alert.alert(
          'Email Not Registered',
          'This email address is not registered in our system. Please contact the school administrator to register your email first.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Email is registered by admin, proceed with account creation
      setLoadingMessage('Creating your account...');
      
      // Try to create Firebase auth account
      let user;
      let isNewAccount = false;
      
      try {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          normalizedEmail,
          password
        );
        user = userCredential.user;
        isNewAccount = true;
      } catch (authError: any) {
        if (authError.code === 'auth/email-already-in-use') {
          // Email already has an account - this is the expected case
          // Show message that account exists and they should login
          Alert.alert(
            'Account Already Exists',
            'Your email is already registered in our system. Please login using the Login screen. If you forgot your password, use the "Forgot Password" option.',
            [{ text: 'Go to Login', onPress: () => router.replace('/') }]
          );
          return;
        } else {
          // Other auth errors
          throw authError;
        }
      }

      // Only save to database if it's a new account
      if (isNewAccount && user) {
        // Save user data to database with student linkage
        await set(ref(database, `users/${user.uid}`), {
          email: normalizedEmail,
          role: 'parent',
          parentUid: parentInfo?.rfid || '',
          studentId: studentData?.rfid || '',
          studentName: `${studentData?.firstName || ''} ${studentData?.lastName || ''}`.trim(),
          name: parentInfo?.name || '',
          createdAt: Date.now(),
          accountStatus: 'active',
          signInMethod: 'email',
        });

        Alert.alert(
          'Success!',
          'Your parent account has been created successfully! You can now login to monitor your child.',
          [{ text: 'OK', onPress: () => router.replace('/') }]
        );
      }
    } catch (error: any) {
      console.error('Signup error:', error);

      let errorMessage = 'Failed to create account. Please try again.';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please use the "Forgot Password" option on the login screen if you need to reset your password.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use a stronger password with at least 6 characters.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert('Signup Failed', errorMessage);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  return (
    <View style={styles.fullScreenContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#1999e8" />
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Section with Gradient */}
          <LinearGradient
            colors={['#1999e8', '#0e77c0', '#0a5a91']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerSection}
          >
            {/* Animated Background Circles */}
            <View style={styles.circle1} />
            <View style={styles.circle2} />
            <View style={styles.circle3} />
            <View style={styles.headerContent}>
              <View style={styles.logoContainer}>
                <Text style={styles.logoEmoji}>🎓</Text>
              </View>
              <Text style={styles.titleText}>Create Parent Account</Text>
              <Text style={styles.subtitleText}>Sign up to monitor your child's progress</Text>
            </View>
          </LinearGradient>

          {/* Form Section */}
          <View style={styles.formSection}>
            <View style={styles.glassCard}>
              {/* Email */}
              <View style={styles.inputContainer}>
                <Icon name="mail" size={20} color="#888" style={styles.inputIcon} />
                <TextInput
                  placeholder="Email address"
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
                Enter a valid email address
              </Text>

              {/* Password */}
              <View style={styles.inputContainer}>
                <Icon name="lock" size={20} color="#888" style={styles.inputIcon} />
                <TextInput
                  placeholder="Create password (min 6 characters)"
                  placeholderTextColor="#888"
                  secureTextEntry={!showPassword}
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  editable={!isLoading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                  disabled={isLoading}
                >
                  <Icon name={showPassword ? "eye-off" : "eye"} size={20} color="#888" />
                </TouchableOpacity>
              </View>

              {/* Confirm Password */}
              <View style={styles.inputContainer}>
                <Icon name="lock" size={20} color="#888" style={styles.inputIcon} />
                <TextInput
                  placeholder="Confirm password"
                  placeholderTextColor="#888"
                  secureTextEntry={!showConfirmPassword}
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!isLoading}
                  onSubmitEditing={handleSignUp}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeIcon}
                  disabled={isLoading}
                >
                  <Icon name={showConfirmPassword ? "eye-off" : "eye"} size={20} color="#888" />
                </TouchableOpacity>
              </View>

              <Text style={styles.helperText}>
                Password must be at least 6 characters
              </Text>

              {/* Sign Up Button */}
              <LinearGradient
                colors={['#1999e8', '#0e77c0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.button, isLoading && styles.buttonDisabled]}
              >
                <TouchableOpacity
                  style={styles.buttonInner}
                  onPress={handleSignUp}
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
                      <Text style={styles.buttonText}>CREATE ACCOUNT</Text>
                      <Text style={styles.buttonIcon}>→</Text>
                    </>
                  )}
                </TouchableOpacity>
              </LinearGradient>

              {/* Login Link */}
              <View style={styles.loginLinkContainer}>
                <Text style={styles.loginText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => router.back()}>
                  <Text style={styles.loginLink}>Login here</Text>
                </TouchableOpacity>
              </View>
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
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  headerSection: {
    paddingTop: 60,
    paddingBottom: 40,
    paddingHorizontal: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  circle1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    top: -50,
    right: -50,
  },
  circle2: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    bottom: 20,
    left: -30,
  },
  circle3: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    top: 100,
    left: 50,
  },
  headerContent: {
    alignItems: 'center',
    zIndex: 1,
  },
  logoContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  logoEmoji: {
    fontSize: 45,
  },
  titleText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitleText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    fontWeight: '500',
  },
  formSection: {
    flex: 1,
    marginTop: -20,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 30,
    padding: 25,
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fb',
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingVertical: 5,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e8ecf1',
    height: 58,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingVertical: 12,
  },
  eyeIcon: {
    padding: 5,
  },
  helperText: {
    fontSize: 12,
    color: '#888',
    marginBottom: 15,
    marginLeft: 5,
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
    opacity: 0.6,
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
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 25,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e8ecf1',
  },
  dividerText: {
    marginHorizontal: 15,
    fontSize: 14,
    color: '#999',
    fontWeight: '600',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e8ecf1',
    borderRadius: 15,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  googleIcon: {
    fontSize: 24,
    fontWeight: 'bold',
    marginRight: 10,
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  loginLinkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(25, 153, 232, 0.2)',
  },
  loginText: {
    fontSize: 14,
    color: '#666',
  },
  loginLink: {
    fontSize: 14,
    color: '#1999e8',
    fontWeight: '700',
    textDecorationLine: 'underline',
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
});

export default ParentSignUpScreen;
