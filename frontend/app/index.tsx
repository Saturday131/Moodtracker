import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface MoodLayers {
  overall: number;
  energy: number;
  stress: number;
  productivity: number;
  social: number;
}

interface MoodEntry {
  id: string;
  date: string;
  time_of_day: string;
  layers: MoodLayers;
  note: string | null;
}

interface DailySummary {
  mood_today: {
    entries: number;
    average_score: number;
  };
  mood_comparison: {
    today_avg: number;
    week_avg: number;
    trend: string;
  };
  notes_today: Array<{
    title: string;
    content: string;
    category: string;
  }>;
  pending_tasks: Array<{
    task: string;
  }>;
  ai_summary: string | null;
}

const TIME_OPTIONS = [
  { key: 'morning', label: 'Rano', icon: 'sunny', emoji: '🌅' },
  { key: 'midday', label: 'Południe', icon: 'sunny', emoji: '☀️' },
  { key: 'evening', label: 'Wieczór', icon: 'moon', emoji: '🌙' },
];

const MOOD_LAYERS = [
  { key: 'overall', label: 'Ogólny Nastrój', emoji: '😊', color: '#6366F1' },
  { key: 'energy', label: 'Poziom Energii', emoji: '⚡', color: '#F59E0B' },
  { key: 'stress', label: 'Poziom Spokoju', emoji: '🧘', color: '#10B981' },
  { key: 'productivity', label: 'Produktywność', emoji: '💪', color: '#EC4899' },
  { key: 'social', label: 'Nastrój Społeczny', emoji: '👥', color: '#8B5CF6' },
];

const SCORE_LABELS = ['Bardzo Niski', 'Niski', 'Średni', 'Dobry', 'Świetny'];
const SCORE_COLORS = ['#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E'];

export default function TodayScreen() {
  const router = useRouter();
  const [selectedTime, setSelectedTime] = useState<string>('morning');
  const [layers, setLayers] = useState<MoodLayers>({
    overall: 3,
    energy: 3,
    stress: 3,
    productivity: 3,
    social: 3,
  });
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingMood, setFetchingMood] = useState(true);
  const [existingMoods, setExistingMoods] = useState<Record<string, MoodEntry | null>>({});
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');
  const displayDate = format(new Date(), 'EEEE, d MMMM yyyy', { locale: pl });

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setSelectedTime('morning');
    else if (hour < 17) setSelectedTime('midday');
    else setSelectedTime('evening');
  }, []);

  const fetchTodayMoods = async () => {
    try {
      setFetchingMood(true);
      const response = await fetch(`${API_URL}/api/moods/date/${today}`);
      if (response.ok) {
        const data = await response.json();
        setExistingMoods(data);
        
        if (data[selectedTime]) {
          setLayers(data[selectedTime].layers);
          setNote(data[selectedTime].note || '');
        }
      }
    } catch (error) {
      console.error('Error fetching moods:', error);
    } finally {
      setFetchingMood(false);
    }
  };

  useEffect(() => {
    fetchTodayMoods();
  }, [today]);

  const fetchDailySummary = async () => {
    setLoadingSummary(true);
    try {
      const response = await fetch(`${API_URL}/api/summary/today`);
      if (response.ok) {
        const data = await response.json();
        setDailySummary(data);
        setShowSummary(true);
      }
    } catch (error) {
      console.error('Error fetching summary:', error);
      Alert.alert('Błąd', 'Nie udało się pobrać podsumowania');
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    if (existingMoods[selectedTime]) {
      setLayers(existingMoods[selectedTime]!.layers);
      setNote(existingMoods[selectedTime]!.note || '');
    } else {
      setLayers({ overall: 3, energy: 3, stress: 3, productivity: 3, social: 3 });
      setNote('');
    }
  }, [selectedTime, existingMoods]);

  const updateLayer = (key: keyof MoodLayers, value: number) => {
    setLayers(prev => ({ ...prev, [key]: value }));
  };

  const saveMood = async () => {
    setLoading(true);
    Keyboard.dismiss();

    try {
      const response = await fetch(`${API_URL}/api/moods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today,
          time_of_day: selectedTime,
          layers,
          note: note.trim() || null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setExistingMoods(prev => ({ ...prev, [selectedTime]: data }));
        const timeLabel = TIME_OPTIONS.find(t => t.key === selectedTime)?.label;
        Alert.alert('Zapisano!', `Twój nastrój ${timeLabel?.toLowerCase()} został zapisany!`);
      } else {
        Alert.alert('Błąd', 'Nie udało się zapisać nastroju. Spróbuj ponownie.');
      }
    } catch (error) {
      console.error('Error saving mood:', error);
      Alert.alert('Błąd', 'Nie udało się zapisać nastroju. Sprawdź połączenie.');
    } finally {
      setLoading(false);
    }
  };

  const calculateComposite = (): number => {
    const weights = { overall: 0.3, energy: 0.2, stress: 0.2, productivity: 0.15, social: 0.15 };
    let total = 0;
    for (const [key, weight] of Object.entries(weights)) {
      total += layers[key as keyof MoodLayers] * weight;
    }
    return Math.round(total * 10) / 10;
  };

  if (fetchingMood) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Ładowanie...</Text>
      </View>
    );
  }

  const composite = calculateComposite();
  const hasExisting = !!existingMoods[selectedTime];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.dateText}>{displayDate}</Text>
            <Text style={styles.title}>Jak się czujesz?</Text>
          </View>

          {/* Time of Day Selector */}
          <View style={styles.timeSelector}>
            {TIME_OPTIONS.map((time) => {
              const hasMood = !!existingMoods[time.key];
              return (
                <TouchableOpacity
                  key={time.key}
                  style={[
                    styles.timeButton,
                    selectedTime === time.key && styles.timeButtonActive,
                  ]}
                  onPress={() => setSelectedTime(time.key)}
                >
                  <Text style={styles.timeEmoji}>{time.emoji}</Text>
                  <Text
                    style={[
                      styles.timeLabel,
                      selectedTime === time.key && styles.timeLabelActive,
                    ]}
                  >
                    {time.label}
                  </Text>
                  {hasMood && (
                    <View style={styles.completedDot} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Composite Score */}
          <View style={styles.compositeCard}>
            <Text style={styles.compositeLabel}>Wynik Łączny</Text>
            <Text style={[styles.compositeValue, { color: SCORE_COLORS[Math.round(composite) - 1] || '#6B7280' }]}>
              {composite.toFixed(1)} / 5.0
            </Text>
          </View>

          {/* Mood Layers */}
          <View style={styles.layersContainer}>
            {MOOD_LAYERS.map((layer) => (
              <View key={layer.key} style={styles.layerCard}>
                <View style={styles.layerHeader}>
                  <Text style={styles.layerEmoji}>{layer.emoji}</Text>
                  <Text style={styles.layerLabel}>{layer.label}</Text>
                  <Text style={[styles.layerValue, { color: SCORE_COLORS[layers[layer.key as keyof MoodLayers] - 1] }]}>
                    {layers[layer.key as keyof MoodLayers]}
                  </Text>
                </View>
                <View style={styles.scoreButtons}>
                  {[1, 2, 3, 4, 5].map((score) => (
                    <TouchableOpacity
                      key={score}
                      style={[
                        styles.scoreButton,
                        layers[layer.key as keyof MoodLayers] === score && {
                          backgroundColor: SCORE_COLORS[score - 1],
                        },
                      ]}
                      onPress={() => updateLayer(layer.key as keyof MoodLayers, score)}
                    >
                      <Text
                        style={[
                          styles.scoreButtonText,
                          layers[layer.key as keyof MoodLayers] === score && styles.scoreButtonTextActive,
                        ]}
                      >
                        {score}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.scoreLabelsRow}>
                  <Text style={styles.scoreLabelLeft}>{layer.key === 'stress' ? 'Zestresowany' : 'Niski'}</Text>
                  <Text style={styles.scoreLabelRight}>{layer.key === 'stress' ? 'Spokojny' : 'Świetny'}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Note Input */}
          <View style={styles.noteContainer}>
            <Text style={styles.noteLabel}>Dodaj notatkę (opcjonalnie)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="Co się dzieje?"
              placeholderTextColor="#6B7280"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Save Button */}
          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveMood}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>
                {hasExisting ? 'Aktualizuj Nastrój' : 'Zapisz Nastrój'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Today's Progress */}
          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Dzisiejsze Wpisy</Text>
            <View style={styles.progressRow}>
              {TIME_OPTIONS.map((time) => {
                const hasMood = !!existingMoods[time.key];
                const mood = existingMoods[time.key];
                return (
                  <View key={time.key} style={styles.progressItem}>
                    <Text style={styles.progressEmoji}>{time.emoji}</Text>
                    {hasMood && mood ? (
                      <Text style={[styles.progressScore, { color: SCORE_COLORS[Math.round(calculateCompositeFromLayers(mood.layers)) - 1] }]}>
                        {calculateCompositeFromLayers(mood.layers).toFixed(1)}
                      </Text>
                    ) : (
                      <Ionicons name="remove" size={20} color="#4B5563" />
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function calculateCompositeFromLayers(layers: MoodLayers): number {
  const weights = { overall: 0.3, energy: 0.2, stress: 0.2, productivity: 0.15, social: 0.15 };
  let total = 0;
  for (const [key, weight] of Object.entries(weights)) {
    total += (layers[key as keyof MoodLayers] || 3) * weight;
  }
  return Math.round(total * 10) / 10;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#9CA3AF',
    marginTop: 10,
    fontSize: 16,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  timeSelector: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  timeButton: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  timeButtonActive: {
    borderColor: '#6366F1',
    backgroundColor: '#1E1B4B',
  },
  timeEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  timeLabelActive: {
    color: '#FFFFFF',
  },
  completedDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  compositeCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  compositeLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  compositeValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  layersContainer: {
    gap: 12,
    marginBottom: 16,
  },
  layerCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
  },
  layerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  layerEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  layerLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  layerValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  scoreButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  scoreButton: {
    flex: 1,
    backgroundColor: '#374151',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  scoreButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  scoreButtonTextActive: {
    color: '#FFFFFF',
  },
  scoreLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  scoreLabelLeft: {
    fontSize: 11,
    color: '#6B7280',
  },
  scoreLabelRight: {
    fontSize: 11,
    color: '#6B7280',
  },
  noteContainer: {
    marginBottom: 16,
  },
  noteLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  noteInput: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 15,
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#374151',
  },
  saveButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  progressCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 12,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  progressItem: {
    alignItems: 'center',
  },
  progressEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  progressScore: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
