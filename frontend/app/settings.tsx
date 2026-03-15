import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const DAYS_OF_WEEK = [
  { key: 0, label: 'Poniedziałek' },
  { key: 1, label: 'Wtorek' },
  { key: 2, label: 'Środa' },
  { key: 3, label: 'Czwartek' },
  { key: 4, label: 'Piątek' },
  { key: 5, label: 'Sobota' },
  { key: 6, label: 'Niedziela' },
];

const TIME_OPTIONS = [
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
];

interface Settings {
  daily_notification_enabled: boolean;
  daily_notification_time: string;
  weekly_notification_enabled: boolean;
  weekly_notification_day: number;
  weekly_notification_time: string;
}

export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    daily_notification_enabled: true,
    daily_notification_time: '21:00',
    weekly_notification_enabled: true,
    weekly_notification_day: 6,
    weekly_notification_time: '10:00',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${API_URL}/api/settings`);
      if (response.ok) {
        const data = await response.json();
        setSettings({
          daily_notification_enabled: data.daily_notification_enabled ?? true,
          daily_notification_time: data.daily_notification_time ?? '21:00',
          weekly_notification_enabled: data.weekly_notification_enabled ?? true,
          weekly_notification_day: data.weekly_notification_day ?? 6,
          weekly_notification_time: data.weekly_notification_time ?? '10:00',
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (key: string, value: any) => {
    setSaving(true);
    try {
      const params = new URLSearchParams();
      params.append(key, String(value));
      
      const response = await fetch(`${API_URL}/api/settings?${params.toString()}`, {
        method: 'PUT',
      });
      
      if (response.ok) {
        const data = await response.json();
        setSettings({
          daily_notification_enabled: data.daily_notification_enabled ?? true,
          daily_notification_time: data.daily_notification_time ?? '21:00',
          weekly_notification_enabled: data.weekly_notification_enabled ?? true,
          weekly_notification_day: data.weekly_notification_day ?? 6,
          weekly_notification_time: data.weekly_notification_time ?? '10:00',
        });
      }
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się zapisać ustawień');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ustawienia</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Daily Summary Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Podsumowanie Dzienne</Text>
          <Text style={styles.sectionDescription}>
            Otrzymuj powiadomienie z podsumowaniem dnia
          </Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Powiadomienia włączone</Text>
            </View>
            <Switch
              value={settings.daily_notification_enabled}
              onValueChange={(value) => {
                setSettings(prev => ({ ...prev, daily_notification_enabled: value }));
                saveSettings('daily_notification_enabled', value);
              }}
              trackColor={{ false: '#374151', true: '#6366F1' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {settings.daily_notification_enabled && (
            <View style={styles.timeSelector}>
              <Text style={styles.timeSelectorLabel}>Godzina powiadomienia</Text>
              <View style={styles.timeOptions}>
                {TIME_OPTIONS.map((time) => (
                  <TouchableOpacity
                    key={time}
                    style={[
                      styles.timeOption,
                      settings.daily_notification_time === time && styles.timeOptionActive,
                    ]}
                    onPress={() => {
                      setSettings(prev => ({ ...prev, daily_notification_time: time }));
                      saveSettings('daily_notification_time', time);
                    }}
                  >
                    <Text style={[
                      styles.timeOptionText,
                      settings.daily_notification_time === time && styles.timeOptionTextActive,
                    ]}>
                      {time}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Weekly Summary Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📈 Podsumowanie Tygodniowe</Text>
          <Text style={styles.sectionDescription}>
            Otrzymuj rozszerzone podsumowanie tygodnia
          </Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Powiadomienia włączone</Text>
            </View>
            <Switch
              value={settings.weekly_notification_enabled}
              onValueChange={(value) => {
                setSettings(prev => ({ ...prev, weekly_notification_enabled: value }));
                saveSettings('weekly_notification_enabled', value);
              }}
              trackColor={{ false: '#374151', true: '#6366F1' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {settings.weekly_notification_enabled && (
            <>
              <View style={styles.daySelector}>
                <Text style={styles.timeSelectorLabel}>Dzień tygodnia</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.dayOptions}>
                    {DAYS_OF_WEEK.map((day) => (
                      <TouchableOpacity
                        key={day.key}
                        style={[
                          styles.dayOption,
                          settings.weekly_notification_day === day.key && styles.dayOptionActive,
                        ]}
                        onPress={() => {
                          setSettings(prev => ({ ...prev, weekly_notification_day: day.key }));
                          saveSettings('weekly_notification_day', day.key);
                        }}
                      >
                        <Text style={[
                          styles.dayOptionText,
                          settings.weekly_notification_day === day.key && styles.dayOptionTextActive,
                        ]}>
                          {day.label.slice(0, 3)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              <View style={styles.timeSelector}>
                <Text style={styles.timeSelectorLabel}>Godzina powiadomienia</Text>
                <View style={styles.timeOptions}>
                  {['08:00', '09:00', '10:00', '11:00', '12:00'].map((time) => (
                    <TouchableOpacity
                      key={time}
                      style={[
                        styles.timeOption,
                        settings.weekly_notification_time === time && styles.timeOptionActive,
                      ]}
                      onPress={() => {
                        setSettings(prev => ({ ...prev, weekly_notification_time: time }));
                        saveSettings('weekly_notification_time', time);
                      }}
                    >
                      <Text style={[
                        styles.timeOptionText,
                        settings.weekly_notification_time === time && styles.timeOptionTextActive,
                      ]}>
                        {time}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Ionicons name="information-circle-outline" size={20} color="#6B7280" />
          <Text style={styles.infoText}>
            Powiadomienia push działają w pełnych buildach aplikacji. W trybie deweloperskim (Expo Go) podsumowania są dostępne w aplikacji i przez czat.
          </Text>
        </View>

        {saving && (
          <View style={styles.savingIndicator}>
            <ActivityIndicator size="small" color="#6366F1" />
            <Text style={styles.savingText}>Zapisywanie...</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    color: '#FFFFFF',
  },
  timeSelector: {
    marginTop: 16,
  },
  timeSelectorLabel: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 10,
  },
  timeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#374151',
  },
  timeOptionActive: {
    backgroundColor: '#6366F1',
  },
  timeOptionText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  timeOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  daySelector: {
    marginTop: 16,
  },
  dayOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  dayOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#374151',
  },
  dayOptionActive: {
    backgroundColor: '#6366F1',
  },
  dayOptionText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  dayOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },
  savingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  savingText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
});
