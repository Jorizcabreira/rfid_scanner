// app/(tabs)/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Badge component for tab icon
type NotificationTabIconProps = {
  color: string;
  focused: boolean;
};

const BADGE_COUNT_KEY = 'notification_badge_count';

function NotificationTabIcon({ color, focused }: NotificationTabIconProps) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    
    const fetchUnreadCount = async () => {
      try {
        const count = await AsyncStorage.getItem(BADGE_COUNT_KEY);
        const parsedCount = count ? parseInt(count, 10) : 0;
        if (isMounted) {
          setUnreadCount(parsedCount);
        }
      } catch (error) {
        console.error('Error fetching badge count:', error);
        if (isMounted) {
          setUnreadCount(0);
        }
      }
    };

    // Initial fetch
    fetchUnreadCount();

    // Set up interval to check for updates
    const interval = setInterval(fetchUnreadCount, 2000); // Check every 2 seconds

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <View style={styles.iconContainer}>
      <Ionicons
        name={focused ? 'notifications' : 'notifications-outline'}
        size={focused ? 26 : 24}
        color={color}
      />
      {unreadCount > 0 && (
        <View style={[
          styles.badgeContainer,
          unreadCount > 9 && styles.badgeContainerLarge
        ]}>
          <Text style={styles.badgeText}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#E0F7FF',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? "home" : "home-outline"} 
              size={focused ? 26 : 24} 
              color={color} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? "calendar" : "calendar-outline"} 
              size={focused ? 26 : 24} 
              color={color} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: 'Report',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons 
              name={focused ? "document-text" : "document-text-outline"} 
              size={focused ? 26 : 24} 
              color={color} 
            />
          ),
        }}
      />
      <Tabs.Screen
        name="notification"
        options={{
          title: 'Notification',
          tabBarIcon: (props) => <NotificationTabIcon {...props} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#1999e8',
    borderTopWidth: 0,
    height: 80,
    paddingBottom: 15,
    paddingTop: 0,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 5,
    letterSpacing: 0.2,
  },
  iconContainer: {
    position: 'relative',
  },
  badgeContainer: {
    position: 'absolute',
    right: -6,
    top: -4,
    backgroundColor: '#e53935',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    zIndex: 10,
    borderWidth: 1.5,
    borderColor: '#1999e8',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  badgeContainerLarge: {
    minWidth: 22,
    height: 18,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});