import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';

const SimpleNotificationTest: React.FC = () => {
  const testNotification = async () => {
    try {
      // Request permission first
      const { status } = await Notifications.requestPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please enable notifications in settings');
        return;
      }

      // Send test notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🎉 RFID Scanner Test",
          body: "Push notifications are working in development build!",
          sound: 'default',
          data: { 
            type: 'test',
            timestamp: Date.now(),
            screen: 'home'
          },
        },
        trigger: null,
      });

      Alert.alert(
        '✅ Success', 
        'Test notification sent!\n\nTry:\n• App open ✓\n• App minimized ✓\n• App closed ✓'
      );

    } catch (error) {
      console.error('Error:', error);
      Alert.alert('❌ Error', 'Failed to send notification');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Development Build Ready! 🚀</Text>
      <Text style={styles.subtitle}>
        This build supports push notifications even when the app is closed
      </Text>
      
      <TouchableOpacity style={styles.button} onPress={testNotification}>
        <Ionicons name="notifications" size={20} color="#fff" />
        <Text style={styles.buttonText}>Test Push Notification</Text>
      </TouchableOpacity>

      <Text style={styles.note}>
        After installing the development build, test notifications in different scenarios
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    color: '#1f2937',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#007bff',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 8,
    gap: 8,
    minWidth: 200,
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  note: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default SimpleNotificationTest;