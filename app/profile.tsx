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
import { auth, database } from '../firebaseConfig'; // ✅ FIXED: Use 'database' instead of 'db'

interface Guardian {
  address: string;
  contact: string;
  email: string;
  name: string;
  rfid: string;
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

  const handleChangePhoto = async () => {
    try {
      // Request permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photos to change your profile picture.');
        return;
      }

      // Launch image picker
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
        
        // Update Firebase
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

    // ✅ FIXED: Use 'database' instead of 'db'
    const userRef = ref(database, `users/${user.uid}`);
    const userListener = onValue(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const userData: UserInfo = snapshot.val();
        setUserInfo(userData);
      } else {
        setUserInfo(null);
      }
    });

    // ✅ FIXED: Use 'database' instead of 'db'
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
        <LinearGradient colors={['#007bff', '#0056b3']} style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ffffff" />
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
            <LinearGradient colors={['#ffffff', '#f8fafc']} style={styles.profileCard}>
              <View style={styles.avatarSection}>
                <TouchableOpacity onPress={handleChangePhoto} style={styles.avatarTouchable} disabled={uploadingPhoto}>
                  {userInfo?.photoBase64 ? (
                    <Image source={{ uri: userInfo.photoBase64 }} style={styles.profileAvatar} />
                  ) : (
                    <LinearGradient colors={['#ff6b6b', '#ff8e8e']} style={styles.profileAvatarPlaceholder}>
                      <Ionicons name="person" size={50} color="#fff" />
                    </LinearGradient>
                  )}
                  <View style={styles.cameraIconContainer}>
                    {uploadingPhoto ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="camera" size={20} color="#fff" />
                    )}
                  </View>
                </TouchableOpacity>
                <Text style={styles.profileName}>{getDisplayName()}</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleLabel}>Parent/Guardian</Text>
                </View>
                {guardianData && (
                  <View style={styles.guardianBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                    <Text style={styles.guardianBadgeText}>Linked to Student</Text>
                  </View>
                )}
              </View>

              <View style={styles.detailsSection}>
                <View style={styles.detailItem}>
                  <Ionicons name="mail-outline" size={20} color="#6b7280" style={styles.detailIcon} />
                  <View style={styles.detailTextContainer}>
                    <Text style={styles.detailLabel}>Email Address</Text>
                    <Text style={styles.detailValue}>{getDisplayEmail()}</Text>
                  </View>
                </View>

                <View style={styles.detailItem}>
                  <Ionicons name="call-outline" size={20} color="#6b7280" style={styles.detailIcon} />
                  <View style={styles.detailTextContainer}>
                    <Text style={styles.detailLabel}>Contact Number</Text>
                    <Text style={styles.detailValue}>{getDisplayContact()}</Text>
                  </View>
                </View>

                <View style={styles.detailItem}>
                  <Ionicons name="location-outline" size={20} color="#6b7280" style={styles.detailIcon} />
                  <View style={styles.detailTextContainer}>
                    <Text style={styles.detailLabel}>Address</Text>
                    <Text style={styles.detailValue}>{getDisplayAddress()}</Text>
                  </View>
                </View>

                {guardianData?.rfid && (
                  <View style={styles.detailItem}>
                    <Ionicons name="id-card-outline" size={20} color="#6b7280" style={styles.detailIcon} />
                    <View style={styles.detailTextContainer}>
                      <Text style={styles.detailLabel}>Guardian RFID</Text>
                      <Text style={styles.detailValue}>{guardianData.rfid}</Text>
                    </View>
                  </View>
                )}
                {auth.currentUser?.uid && (
                  <View style={styles.detailItem}>
                    <Ionicons name="key-outline" size={20} color="#6b7280" style={styles.detailIcon} />
                    <View style={styles.detailTextContainer}>
                      <Text style={styles.detailLabel}>User ID</Text>
                      <Text style={[styles.detailValue, styles.userIdText]} numberOfLines={1} ellipsizeMode="middle">
                        {auth.currentUser.uid}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.buttonsContainer}>
                {isChangingPassword ? (
                  <>
                    <TextInput
                      style={styles.input}
                      placeholder="Old Password"
                      secureTextEntry
                      value={oldPassword}
                      onChangeText={setOldPassword}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="New Password"
                      secureTextEntry
                      value={newPassword}
                      onChangeText={setNewPassword}
                    />
                    <TouchableOpacity style={styles.saveButton} onPress={handleChangePassword}>
                      <Text style={styles.saveButtonText}>Save New Password</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancelButton} onPress={() => setIsChangingPassword(false)}>
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => setIsChangingPassword(true)}>
                    <Ionicons name="shield-checkmark-outline" size={20} color="#007bff" />
                    <Text style={styles.secondaryButtonText}>Change Password</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.logoutButtonFinal} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={20} color="#dc3545" />
                  <Text style={styles.logoutButtonText}>Logout</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>

            {guardianData && (
              <LinearGradient colors={['#f0fdf4', '#dcfce7']} style={styles.guardianCard}>
                <View style={styles.guardianHeader}>
                  <Ionicons name="people-circle-outline" size={24} color="#16a34a" />
                  <Text style={styles.guardianTitle}>Guardian Information</Text>
                </View>
                <Text style={styles.guardianText}>
                  You are registered as a guardian in the system. Your information is linked to student records.
                </Text>
              </LinearGradient>
            )}
          </View>
        ) : (
          <View style={styles.placeholderContainer}>
            <Ionicons name="person-circle-outline" size={80} color="#d1d5db" />
            <Text style={styles.placeholderText}>No user data found.</Text>
            <Text style={styles.placeholderSubtext}>Please make sure you are logged in.</Text>
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
  container: { flex: 1, backgroundColor: '#1999e8' },
  scrollView: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  profileCard: {
    borderRadius: 24,
    padding: 32,
    marginBottom: 20,
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarTouchable: {
    position: 'relative',
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  profileAvatar: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 5,
    borderColor: '#1999e8',
  },
  profileAvatarPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 5,
    borderColor: '#1999e8',
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: '#10b981',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  profileName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  roleBadge: {
    backgroundColor: 'rgba(25, 153, 232, 0.12)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(25, 153, 232, 0.3)',
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  roleLabel: {
    fontSize: 14,
    color: '#1999e8',
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  guardianBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  guardianBadgeText: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  detailsSection: {
    width: '100%',
    backgroundColor: 'rgba(249, 250, 251, 0.6)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.5)',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229, 231, 235, 0.3)',
  },
  detailIcon: {
    marginRight: 16,
    width: 24,
    opacity: 0.7,
  },
  detailTextContainer: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: '#6b7280',
    textTransform: 'uppercase',
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: '#1f2937',
    marginTop: 2,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  userIdText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#6b7280',
  },
  buttonsContainer: {
    width: '100%',
    gap: 14,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#1999e8',
    shadowColor: '#1999e8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  secondaryButtonText: {
    color: '#1999e8',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  input: {
    width: '100%',
    padding: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#10b981',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cancelButton: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#d1d5db',
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '700',
  },
  logoutButtonFinal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 2,
    borderColor: '#ef4444',
    marginTop: 12,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  logoutButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  guardianCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.2)',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  guardianHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  guardianTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#15803d',
    letterSpacing: 0.3,
  },
  guardianText: {
    fontSize: 15,
    color: '#166534',
    lineHeight: 22,
    fontWeight: '500',
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 20,
  },
  placeholderText: {
    fontSize: 20,
    color: '#fff',
    marginTop: 20,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  placeholderSubtext: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 8,
    textAlign: 'center',
    marginHorizontal: 20,
    fontWeight: '500',
  },
  loginButton: {
    marginTop: 24,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  loginButtonText: {
    color: '#1999e8',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});

export default ProfileScreen;