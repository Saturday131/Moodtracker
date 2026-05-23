import React, { useState, useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, ActivityIndicator, View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './auth-context';
import AuthScreen from './auth-screen';
import ProfileModal from './profile-modal';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotifications(authHeaders: Record<string, string>) {
  // Only register on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    // Get the Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: undefined, // Uses the project from app.json
    });
    const token = tokenData.data;
    console.log('Expo Push Token:', token);

    // Send token to backend
    await fetch(`${API_URL}/api/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        token,
        device_name: `${Device.brand || 'Unknown'} ${Device.modelName || 'Device'}`,
      }),
    });

    // Android notification channel
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'Domyślne',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    return token;
  } catch (error) {
    console.log('Push notification registration error:', error);
    return null;
  }
}

function NotificationRegistrar() {
  const { user, authHeaders } = useAuth();
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    if (!user || !authHeaders) return;

    // Register for push notifications
    registerForPushNotifications(authHeaders());

    // Listen for incoming notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification.request.content.title);
    });

    // Listen for notification taps
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      console.log('Notification tapped, data:', data);
      // Navigation could be handled here based on data.screen
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [user, authHeaders]);

  return null;
}

function ProfileButton() {
  const [showProfile, setShowProfile] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setShowProfile(true)} style={{ marginRight: 16 }}>
        <Ionicons name="person-circle-outline" size={28} color="#FFFFFF" />
      </TouchableOpacity>
      <ProfileModal visible={showProfile} onClose={() => setShowProfile(false)} />
    </>
  );
}

function AppContent() {
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <>
      <NotificationRegistrar />
      <Tabs
        screenOptions={{
          headerRight: () => <ProfileButton />,
          tabBarActiveTintColor: '#6366F1',
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarStyle: {
            backgroundColor: '#1F2937',
            borderTopColor: '#374151',
            borderTopWidth: 1,
            height: Platform.OS === 'ios' ? 85 : 70 + Math.max(insets.bottom, 10),
            paddingBottom: Platform.OS === 'ios' ? 25 : Math.max(insets.bottom, 15),
            paddingTop: 8,
            elevation: 8,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
          headerStyle: {
            backgroundColor: '#111827',
          },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Dziś',
            headerTitle: 'Dziennik Nastroju',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="happy" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Kalendarz',
            headerTitle: 'Kalendarz Nastroju',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="calendar" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen name="trends" options={{ href: null }} />
        <Tabs.Screen
          name="notes"
          options={{
            title: 'Notatki',
            headerTitle: 'Moje Notatki',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="document-text" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Czat',
            headerTitle: 'Asystent Nastroju',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen name="export" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="auth-screen" options={{ href: null }} />
        <Tabs.Screen name="auth-context" options={{ href: null }} />
        <Tabs.Screen name="profile-modal" options={{ href: null }} />
      </Tabs>
    </>
  );
}

export default function TabLayout() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
