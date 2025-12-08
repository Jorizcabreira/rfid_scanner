import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { off, onValue, ref, update } from 'firebase/database';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, database } from '../firebaseConfig';

// Design System Constants
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
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

const TYPOGRAPHY = {
  xs: { fontSize: 10, lineHeight: 14, fontFamily: 'System' },
  sm: { fontSize: 12, lineHeight: 16, fontFamily: 'System' },
  base: { fontSize: 14, lineHeight: 20, fontFamily: 'System' },
  lg: { fontSize: 16, lineHeight: 22, fontFamily: 'System' },
  xl: { fontSize: 18, lineHeight: 24, fontFamily: 'System' },
  '2xl': { fontSize: 20, lineHeight: 26, fontFamily: 'System' },
  '3xl': { fontSize: 24, lineHeight: 30, fontFamily: 'System' },
};

const BORDER_RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  '2xl': 22,
  full: 999,
};

const SHADOWS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
};

interface Guardian {
  address: string;
  contact: string;
  email: string;
  name: string;
  rfid: string;
  relationship?: string;
}

interface UserInfo {
  firstName?: string;
  lastName?: string;
  email?: string;
  photoBase64?: string;
  address?: string;
  contactNumber?: string;
  guardians?: { [key: string]: Guardian } | Guardian[];
}

const ProfileScreen = () => {
  const router = useRouter();
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardianData, setGuardianData] = useState<Guardian | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const handleChangePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photos to change your profile picture.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setUploadingPhoto(true);
        const user = auth.currentUser;
        if (!user) {
          Alert.alert('Error', 'You must be logged in to change your photo.');
          return;
        }

        const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
        
        const userRef = ref(database, `users/${user.uid}`);
        await update(userRef, {
          photoBase64: base64Image,
        });

        Alert.alert('Success', 'Profile picture updated successfully!');
        setUploadingPhoto(false);
      }
    } catch (error) {
      console.error('Error changing photo:', error);
      Alert.alert('Error', 'Failed to update profile picture. Please try again.');
      setUploadingPhoto(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
          style: "destructive",
          onPress: async () => {
            try {
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
              
              await auth.signOut();
              router.replace('/');
            } catch (error) {
              console.error('Logout error:', error);
              Alert.alert("Error", "Failed to logout. Please try again.");
            }
          }
        }
      ]
    );
  };

  const handleChangePassword = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      Alert.alert("Error", "You must be logged in with an email to change your password.");
      return;
    }

    if (!oldPassword || !newPassword) {
      Alert.alert("Error", "All fields are required.");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Error", "New password should be at least 6 characters long.");
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(user.email, oldPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      Alert.alert("Success", "Your password has been changed successfully.");
      setShowPasswordForm(false);
      setIsChangingPassword(false);
      setOldPassword('');
      setNewPassword('');
    } catch (error: any) {
      console.error("Password change error:", error.code, error.message);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        Alert.alert("Error", "Incorrect old password. Please try again.");
      } else {
        Alert.alert("Error", "Failed to change password. Please try again.");
      }
    }
  };

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      router.replace('/');
      return;
    }

    setUserEmail(user.email);

    const userRef = ref(database, `users/${user.uid}`);
    const userListener = onValue(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const userData: UserInfo = snapshot.val();
        setUserInfo(userData);
      } else {
        setUserInfo(null);
      }
    });

    const studentsRef = ref(database, 'students');
    const studentsListener = onValue(studentsRef, (snapshot) => {
      let foundGuardian: Guardian | null = null;
      if (snapshot.exists()) {
        const students = snapshot.val();
        for (const studentId in students) {
          const student = students[studentId];
          const guardians = student.guardians;
          if (guardians) {
            const guardiansArray = Array.isArray(guardians) ? guardians : Object.values(guardians);
            foundGuardian = guardiansArray.find(
              (guardian: Guardian) => guardian.email.toLowerCase() === user.email!.toLowerCase()
            );
            if (foundGuardian) {
              setGuardianData(foundGuardian);
              break;
            }
          }
        }
      }
      if (!foundGuardian) {
        setGuardianData(null);
      }
      setLoading(false);
    });

    return () => {
      off(userRef, 'value', userListener);
      off(studentsRef, 'value', studentsListener);
    };
  }, []);

  const getDisplayName = () => {
    if (guardianData?.name) return guardianData.name;
    if (userInfo?.firstName || userInfo?.lastName) return `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim();
    return 'User';
  };

  const getDisplayEmail = () => {
    if (guardianData?.email) return guardianData.email;
    return userInfo?.email || userEmail || 'N/A';
  };

  const getDisplayContact = () => {
    if (guardianData?.contact) return guardianData.contact;
    return userInfo?.contactNumber || 'N/A';
  };

  const getDisplayAddress = () => {
    if (guardianData?.address) return guardianData.address;
    return userInfo?.address || 'N/A';
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <LinearGradient colors={COLORS.primaryGradient} style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.white} />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {userInfo || guardianData ? (
          <View style={styles.content}>
            {/* Header Section */}
            <LinearGradient colors={COLORS.primaryGradient} style={styles.header}>
              <View style={styles.headerContent}>
                <TouchableOpacity onPress={handleChangePhoto} style={styles.avatarTouchable} disabled={uploadingPhoto}>
                  {userInfo?.photoBase64 ? (
                    <Image source={{ uri: userInfo.photoBase64 }} style={styles.profileAvatar} />
                  ) : (
                    <View style={styles.profileAvatarPlaceholder}>
                      <Ionicons name="person" size={32} color={COLORS.white} />
                    </View>
                  )}
                  <View style={styles.cameraIconContainer}>
                    {uploadingPhoto ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <Ionicons name="camera" size={16} color={COLORS.white} />
                    )}
                  </View>
                </TouchableOpacity>
                <View style={styles.headerText}>
                  <Text style={styles.profileName}>{getDisplayName()}</Text>
                  <View style={styles.roleBadge}>
                    <Ionicons name="shield-checkmark" size={12} color={COLORS.white} />
                    <Text style={styles.roleLabel}>Parent/Guardian</Text>
                  </View>
                </View>
              </View>
            </LinearGradient>

            {/* Main Content */}
            <View style={styles.mainContent}>
              {/* Info Card */}
              <View style={styles.infoCard}>
                <Text style={styles.sectionTitle}>Personal Information</Text>
                
                <View style={styles.detailItem}>
                  <View style={styles.detailIconContainer}>
                    <Ionicons name="mail-outline" size={18} color={COLORS.primary} />
                  </View>
                  <View style={styles.detailTextContainer}>
                    <Text style={styles.detailLabel}>Email Address</Text>
                    <Text style={styles.detailValue}>{getDisplayEmail()}</Text>
                  </View>
                </View>

                <View style={styles.detailItem}>
                  <View style={styles.detailIconContainer}>
                    <Ionicons name="call-outline" size={18} color={COLORS.primary} />
                  </View>
                  <View style={styles.detailTextContainer}>
                    <Text style={styles.detailLabel}>Contact Number</Text>
                    <Text style={styles.detailValue}>{getDisplayContact()}</Text>
                  </View>
                </View>

                <View style={styles.detailItem}>
                  <View style={styles.detailIconContainer}>
                    <Ionicons name="location-outline" size={18} color={COLORS.primary} />
                  </View>
                  <View style={styles.detailTextContainer}>
                    <Text style={styles.detailLabel}>Address</Text>
                    <Text style={styles.detailValue}>{getDisplayAddress()}</Text>
                  </View>
                </View>

                {guardianData?.rfid && (
                  <View style={styles.detailItem}>
                    <View style={styles.detailIconContainer}>
                      <Ionicons name="id-card-outline" size={18} color={COLORS.primary} />
                    </View>
                    <View style={styles.detailTextContainer}>
                      <Text style={styles.detailLabel}>Guardian RFID</Text>
                      <Text style={styles.detailValue}>{guardianData.rfid}</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Guardian Status Card */}
              {guardianData && (
                <View style={styles.guardianCard}>
                  <View style={styles.guardianHeader}>
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                    <Text style={styles.guardianTitle}>Verified Guardian</Text>
                  </View>
                  <Text style={styles.guardianText}>
                    You are registered as a guardian and linked to student records in the system.
                  </Text>
                  {guardianData.relationship && (
                    <View style={styles.relationshipBadge}>
                      <Text style={styles.relationshipText}>{guardianData.relationship}</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Security Section */}
              <View style={styles.securityCard}>
                <Text style={styles.sectionTitle}>Security</Text>
                
                {!showPasswordForm ? (
                  <TouchableOpacity 
                    style={styles.securityButton}
                    onPress={() => setShowPasswordForm(true)}
                  >
                    <View style={styles.securityButtonContent}>
                      <View style={styles.securityIconContainer}>
                        <Ionicons name="lock-closed" size={20} color={COLORS.primary} />
                      </View>
                      <View style={styles.securityTextContainer}>
                        <Text style={styles.securityTitle}>Change Password</Text>
                        <Text style={styles.securitySubtitle}>Update your account password</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={COLORS.gray400} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.passwordForm}>
                    <Text style={styles.formTitle}>Change Password</Text>
                    
                    <TextInput
                      style={styles.input}
                      placeholder="Current Password"
                      placeholderTextColor={COLORS.gray400}
                      secureTextEntry
                      value={oldPassword}
                      onChangeText={setOldPassword}
                    />
                    
                    <TextInput
                      style={styles.input}
                      placeholder="New Password"
                      placeholderTextColor={COLORS.gray400}
                      secureTextEntry
                      value={newPassword}
                      onChangeText={setNewPassword}
                    />
                    
                    <View style={styles.formButtons}>
                      <TouchableOpacity 
                        style={styles.cancelFormButton}
                        onPress={() => {
                          setShowPasswordForm(false);
                          setOldPassword('');
                          setNewPassword('');
                        }}
                      >
                        <Text style={styles.cancelFormButtonText}>Cancel</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity 
                        style={[
                          styles.saveFormButton,
                          (!oldPassword || !newPassword) && styles.saveFormButtonDisabled
                        ]}
                        onPress={handleChangePassword}
                        disabled={!oldPassword || !newPassword}
                      >
                        <Text style={styles.saveFormButtonText}>Update Password</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>

              {/* Account Actions */}
              <View style={styles.actionsCard}>
                <Text style={styles.sectionTitle}>Account</Text>
                
                <TouchableOpacity style={styles.actionButton} onPress={handleLogout}>
                  <View style={styles.actionButtonContent}>
                    <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.1)' }]}>
                      <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
                    </View>
                    <View style={styles.actionTextContainer}>
                      <Text style={styles.actionTitle}>Logout</Text>
                      <Text style={styles.actionSubtitle}>Sign out of your account</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>

              {/* User ID Info */}
              {auth.currentUser?.uid && (
                <View style={styles.userIdCard}>
                  <View style={styles.userIdHeader}>
                    <Ionicons name="information-circle" size={16} color={COLORS.gray500} />
                    <Text style={styles.userIdLabel}>User ID</Text>
                  </View>
                  <Text style={styles.userIdValue} numberOfLines={1} ellipsizeMode="middle">
                    {auth.currentUser.uid}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <View style={styles.placeholderIcon}>
              <Ionicons name="person-circle-outline" size={64} color={COLORS.gray400} />
            </View>
            <Text style={styles.placeholderTitle}>No User Data</Text>
            <Text style={styles.placeholderSubtitle}>
              Please make sure you are properly logged in and your account is linked to a student.
            </Text>
            <TouchableOpacity style={styles.loginButton} onPress={() => router.replace('/')}>
              <Text style={styles.loginButtonText}>Go to Login</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.primary 
  },
  scrollView: { 
    flex: 1 
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    ...TYPOGRAPHY.base,
    color: COLORS.white,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  
  // Header Section
  header: {
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarTouchable: {
    position: 'relative',
    marginRight: SPACING.lg,
  },
  profileAvatar: {
    width: 70,
    height: 70,
    borderRadius: BORDER_RADIUS['2xl'],
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  profileAvatarPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: BORDER_RADIUS['2xl'],
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: COLORS.success,
    width: 28,
    height: 28,
    borderRadius: BORDER_RADIUS.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  headerText: {
    flex: 1,
  },
  profileName: {
    ...TYPOGRAPHY['2xl'],
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    alignSelf: 'flex-start',
    gap: SPACING.xs,
  },
  roleLabel: {
    ...TYPOGRAPHY.xs,
    color: COLORS.white,
    fontWeight: '600',
  },
  
  // Main Content
  mainContent: {
    padding: SPACING.lg,
    marginTop: -SPACING.xl,
  },
  
  // Cards
  infoCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  guardianCard: {
    backgroundColor: COLORS.successLight,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.success,
  },
  securityCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  actionsCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  userIdCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  
  // Section Titles
  sectionTitle: {
    ...TYPOGRAPHY.lg,
    fontWeight: '700',
    color: COLORS.gray800,
    marginBottom: SPACING.lg,
  },
  
  // Detail Items
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  detailIconContainer: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(25, 153, 232, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  detailTextContainer: {
    flex: 1,
  },
  detailLabel: {
    ...TYPOGRAPHY.xs,
    color: COLORS.gray500,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  detailValue: {
    ...TYPOGRAPHY.base,
    color: COLORS.gray800,
    fontWeight: '500',
  },
  
  // Guardian Card
  guardianHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  guardianTitle: {
    ...TYPOGRAPHY.base,
    fontWeight: '700',
    color: COLORS.successDark,
  },
  guardianText: {
    ...TYPOGRAPHY.sm,
    color: COLORS.successDark,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  relationshipBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
  },
  relationshipText: {
    ...TYPOGRAPHY.xs,
    color: COLORS.successDark,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  
  // Security Section
  securityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  securityButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  securityIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(25, 153, 232, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  securityTextContainer: {
    flex: 1,
  },
  securityTitle: {
    ...TYPOGRAPHY.base,
    fontWeight: '600',
    color: COLORS.gray800,
    marginBottom: 2,
  },
  securitySubtitle: {
    ...TYPOGRAPHY.xs,
    color: COLORS.gray500,
  },
  
  // Password Form
  passwordForm: {
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  formTitle: {
    ...TYPOGRAPHY.base,
    fontWeight: '600',
    color: COLORS.gray800,
    marginBottom: SPACING.lg,
  },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray300,
    ...TYPOGRAPHY.base,
    color: COLORS.gray800,
  },
  formButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  cancelFormButton: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.gray200,
    alignItems: 'center',
  },
  cancelFormButtonText: {
    ...TYPOGRAPHY.base,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  saveFormButton: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  saveFormButtonDisabled: {
    backgroundColor: COLORS.gray300,
  },
  saveFormButtonText: {
    ...TYPOGRAPHY.base,
    fontWeight: '600',
    color: COLORS.white,
  },
  
  // Action Button
  actionButton: {
    padding: SPACING.md,
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  actionButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  actionTextContainer: {
    flex: 1,
  },
  actionTitle: {
    ...TYPOGRAPHY.base,
    fontWeight: '600',
    color: COLORS.gray800,
    marginBottom: 2,
  },
  actionSubtitle: {
    ...TYPOGRAPHY.xs,
    color: COLORS.gray500,
  },
  
  // User ID Card
  userIdHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  userIdLabel: {
    ...TYPOGRAPHY.xs,
    color: COLORS.gray500,
    fontWeight: '600',
  },
  userIdValue: {
    ...TYPOGRAPHY.xs,
    color: COLORS.gray600,
    fontFamily: 'monospace',
  },
  
  // Placeholder State
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    minHeight: 400,
  },
  placeholderIcon: {
    marginBottom: SPACING.lg,
  },
  placeholderTitle: {
    ...TYPOGRAPHY.xl,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  placeholderSubtitle: {
    ...TYPOGRAPHY.base,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 20,
  },
  loginButton: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    ...SHADOWS.sm,
  },
  loginButtonText: {
    ...TYPOGRAPHY.base,
    fontWeight: '600',
    color: COLORS.primary,
  },
});

export default ProfileScreen;