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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from './auth-context';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const DAYS_OF_WEEK = [
  { key: 0, label: 'Pn' },
  { key: 1, label: 'Wt' },
  { key: 2, label: 'Śr' },
  { key: 3, label: 'Cz' },
  { key: 4, label: 'Pt' },
  { key: 5, label: 'So' },
  { key: 6, label: 'Nd' },
];

interface Settings {
  daily_notification_enabled: boolean;
  daily_notification_time: string;
  weekly_notification_enabled: boolean;
  weekly_notification_day: number;
  weekly_notification_time: string;
  task_reminders_enabled: boolean;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { authHeaders, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingSend, setTestingSend] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    daily_notification_enabled: true,
    daily_notification_time: '21:00',
    weekly_notification_enabled: true,
    weekly_notification_day: 6,
    weekly_notification_time: '10:00',
    task_reminders_enabled: true,
  });

  // Time picker state
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'daily' | 'weekly'>('daily');
  const [pickerHour, setPickerHour] = useState(21);
  const [pickerMinute, setPickerMinute] = useState(0);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${API_URL}/api/settings`, {
        headers: authHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setSettings({
          daily_notification_enabled: data.daily_notification_enabled ?? true,
          daily_notification_time: data.daily_notification_time ?? '21:00',
          weekly_notification_enabled: data.weekly_notification_enabled ?? true,
          weekly_notification_day: data.weekly_notification_day ?? 6,
          weekly_notification_time: data.weekly_notification_time ?? '10:00',
          task_reminders_enabled: data.task_reminders_enabled ?? true,
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
        headers: authHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        setSettings({
          daily_notification_enabled: data.daily_notification_enabled ?? true,
          daily_notification_time: data.daily_notification_time ?? '21:00',
          weekly_notification_enabled: data.weekly_notification_enabled ?? true,
          weekly_notification_day: data.weekly_notification_day ?? 6,
          weekly_notification_time: data.weekly_notification_time ?? '10:00',
          task_reminders_enabled: data.task_reminders_enabled ?? true,
        });
      }
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się zapisać ustawień');
    } finally {
      setSaving(false);
    }
  };

  const openTimePicker = (target: 'daily' | 'weekly') => {
    const time = target === 'daily'
      ? settings.daily_notification_time
      : settings.weekly_notification_time;
    const [h, m] = time.split(':').map(Number);
    setPickerHour(h);
    setPickerMinute(m);
    setPickerTarget(target);
    setShowTimePicker(true);
  };

  const confirmTime = () => {
    const time = `${pickerHour.toString().padStart(2, '0')}:${pickerMinute.toString().padStart(2, '0')}`;
    const key = pickerTarget === 'daily' ? 'daily_notification_time' : 'weekly_notification_time';
    setSettings(prev => ({ ...prev, [key]: time }));
    saveSettings(key, time);
    setShowTimePicker(false);
  };

  const sendTestNotification = async () => {
    setTestingSend(true);
    try {
      const response = await fetch(`${API_URL}/api/push-token/test`, {
        headers: authHeaders(),
      });
      if (response.ok) {
        Alert.alert('Sukces', 'Testowe powiadomienie zostało wysłane!');
      } else {
        const data = await response.json();
        Alert.alert('Info', data.detail || 'Zarejestruj token push na fizycznym urządzeniu.');
      }
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się wysłać testowego powiadomienia');
    } finally {
      setTestingSend(false);
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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} data-testid="settings-back-btn">
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ustawienia</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Task Reminders Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="alarm-outline" size={20} color="#F59E0B" />
            <Text style={styles.sectionTitle}>Przypomnienia o zadaniach</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Otrzymuj powiadomienie w momencie zaplanowanym dla zadania
          </Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Przypomnienia włączone</Text>
            </View>
            <Switch
              data-testid="task-reminders-switch"
              value={settings.task_reminders_enabled}
              onValueChange={(value) => {
                setSettings(prev => ({ ...prev, task_reminders_enabled: value }));
                saveSettings('task_reminders_enabled', value);
              }}
              trackColor={{ false: '#374151', true: '#F59E0B' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Daily Summary Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="sunny-outline" size={20} color="#6366F1" />
            <Text style={styles.sectionTitle}>Podsumowanie dzienne</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Przypomnienie o zapisaniu nastroju i podsumowanie dnia
          </Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Powiadomienia włączone</Text>
            </View>
            <Switch
              data-testid="daily-notification-switch"
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
            <View style={styles.timePickerRow}>
              <Text style={styles.timeSelectorLabel}>Godzina powiadomienia</Text>
              <TouchableOpacity style={styles.timePickerBtn} onPress={() => openTimePicker('daily')}>
                <Ionicons name="time-outline" size={18} color="#6366F1" />
                <Text style={styles.timePickerBtnText}>{settings.daily_notification_time}</Text>
                <Ionicons name="chevron-forward" size={16} color="#6B7280" />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Weekly Summary Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="bar-chart-outline" size={20} color="#22C55E" />
            <Text style={styles.sectionTitle}>Podsumowanie tygodniowe</Text>
          </View>
          <Text style={styles.sectionDescription}>
            Rozszerzone podsumowanie tygodnia z analizą trendów
          </Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Powiadomienia włączone</Text>
            </View>
            <Switch
              data-testid="weekly-notification-switch"
              value={settings.weekly_notification_enabled}
              onValueChange={(value) => {
                setSettings(prev => ({ ...prev, weekly_notification_enabled: value }));
                saveSettings('weekly_notification_enabled', value);
              }}
              trackColor={{ false: '#374151', true: '#22C55E' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {settings.weekly_notification_enabled && (
            <>
              {/* Day selector — all 7 days visible, no scroll needed */}
              <View style={styles.daySelector}>
                <Text style={styles.timeSelectorLabel}>Dzień tygodnia</Text>
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
                        {day.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.timePickerRow}>
                <Text style={styles.timeSelectorLabel}>Godzina powiadomienia</Text>
                <TouchableOpacity style={[styles.timePickerBtn, styles.timePickerBtnGreen]} onPress={() => openTimePicker('weekly')}>
                  <Ionicons name="time-outline" size={18} color="#22C55E" />
                  <Text style={styles.timePickerBtnText}>{settings.weekly_notification_time}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#6B7280" />
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Test Notification */}
        <TouchableOpacity
          style={styles.testButton}
          onPress={sendTestNotification}
          disabled={testingSend}
          data-testid="test-notification-btn"
        >
          {testingSend ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="notifications-outline" size={20} color="#FFFFFF" />
              <Text style={styles.testButtonText}>Wyślij testowe powiadomienie</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <Ionicons name="information-circle-outline" size={20} color="#6B7280" />
          <Text style={styles.infoText}>
            Powiadomienia push działają na fizycznych urządzeniach (iOS/Android). W trybie webowym powiadomienia są dostępne w aplikacji i przez czat AI.
          </Text>
        </View>

        {saving && (
          <View style={styles.savingIndicator}>
            <ActivityIndicator size="small" color="#6366F1" />
            <Text style={styles.savingText}>Zapisywanie...</Text>
          </View>
        )}

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={logout}
          data-testid="logout-btn"
        >
          <Ionicons name="log-out-outline" size={20} color="#EF4444" />
          <Text style={styles.logoutText}>Wyloguj się</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Time Picker Modal */}
      <Modal visible={showTimePicker} transparent animationType="fade" onRequestClose={() => setShowTimePicker(false)}>
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowTimePicker(false)}>
          <View style={styles.pickerPopup} onStartShouldSetResponder={() => true}>
            <Text style={styles.pickerTitle}>
              {pickerTarget === 'daily' ? 'Godzina dziennego powiadomienia' : 'Godzina tygodniowego powiadomienia'}
            </Text>
            <View style={styles.pickerColumns}>
              {/* Hour column */}
              <View style={styles.pickerColumn}>
                <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                  {Array.from({ length: 24 }, (_, i) => i).map(h => (
                    <TouchableOpacity
                      key={h}
                      style={[styles.pickerCell, pickerHour === h && styles.pickerCellActive]}
                      onPress={() => setPickerHour(h)}
                    >
                      <Text style={[styles.pickerCellText, pickerHour === h && styles.pickerCellTextActive]}>
                        {h.toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.pickerColLabel}>godz.</Text>
              </View>

              <Text style={styles.pickerSep}>:</Text>

              {/* Minute column (5-minute steps) */}
              <View style={styles.pickerColumn}>
                <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
                  {Array.from({ length: 12 }, (_, i) => i * 5).map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.pickerCell, pickerMinute === m && styles.pickerCellActive]}
                      onPress={() => setPickerMinute(m)}
                    >
                      <Text style={[styles.pickerCellText, pickerMinute === m && styles.pickerCellTextActive]}>
                        {m.toString().padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.pickerColLabel}>min.</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.pickerConfirm} onPress={confirmTime}>
              <Text style={styles.pickerConfirmText}>
                Potwierdź {pickerHour.toString().padStart(2, '0')}:{pickerMinute.toString().padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sectionDescription: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 16,
    marginLeft: 28,
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
  timePickerRow: {
    marginTop: 16,
  },
  timeSelectorLabel: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 10,
  },
  timePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  timePickerBtnGreen: {
    // inherits timePickerBtn, accent via icon color
  },
  timePickerBtnText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  daySelector: {
    marginTop: 16,
  },
  dayOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayOption: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayOptionActive: {
    backgroundColor: '#22C55E',
  },
  dayOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  dayOptionTextActive: {
    color: '#FFFFFF',
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  testButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
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
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 32,
    gap: 10,
    borderWidth: 1,
    borderColor: '#EF444430',
  },
  logoutText: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '600',
  },
  // Time picker modal styles
  pickerOverlay: {
    flex: 1,
    backgroundColor: '#00000088',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerPopup: {
    backgroundColor: '#1F2937',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 320,
  },
  pickerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  pickerColumns: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  pickerColumn: {
    alignItems: 'center',
    flex: 1,
  },
  pickerScroll: {
    height: 180,
  },
  pickerCell: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 2,
  },
  pickerCellActive: {
    backgroundColor: '#6366F1',
  },
  pickerCellText: {
    color: '#9CA3AF',
    fontSize: 20,
    fontWeight: '500',
  },
  pickerCellTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  pickerColLabel: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
  pickerSep: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  pickerConfirm: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  pickerConfirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
