import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './auth-context';
import AuthScreen from './auth-screen';

function AppContent() {
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const [showProfile, setShowProfile] = useState(false);

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
    <ProfileModal visible={showProfile} onClose={() => setShowProfile(false)} />
    <Tabs
      screenOptions={{
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
