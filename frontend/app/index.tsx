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
import { format } from 'date-fns';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface MoodOption {
  type: string;
  value: number;
  emoji: string;
  label: string;
  color: string;
}

const MOOD_OPTIONS: MoodOption[] = [
  { type: 'great', value: 5, emoji: '😄', label: 'Great', color: '#22C55E' },
  { type: 'good', value: 4, emoji: '🙂', label: 'Good', color: '#84CC16' },
  { type: 'okay', value: 3, emoji: '😐', label: 'Okay', color: '#EAB308' },
  { type: 'low', value: 2, emoji: '😔', label: 'Low', color: '#F97316' },
  { type: 'bad', value: 1, emoji: '😢', label: 'Bad', color: '#EF4444' },
];

export default function TodayScreen() {
  const [selectedMood, setSelectedMood] = useState<MoodOption | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [todayMood, setTodayMood] = useState<any>(null);
  const [fetchingToday, setFetchingToday] = useState(true);

  const today = format(new Date(), 'yyyy-MM-dd');
  const displayDate = format(new Date(), 'EEEE, MMMM d, yyyy');

  const fetchTodayMood = async () => {
    try {
      setFetchingToday(true);
      const response = await fetch(`${API_URL}/api/moods/date/${today}`);
      if (response.ok) {
        const data = await response.json();
        if (data) {
          setTodayMood(data);
          const mood = MOOD_OPTIONS.find(m => m.type === data.mood_type);
          if (mood) setSelectedMood(mood);
          setNote(data.note || '');
        }
      }
    } catch (error) {
      console.error('Error fetching today mood:', error);
    } finally {
      setFetchingToday(false);
    }
  };

  useEffect(() => {
    fetchTodayMood();
  }, [today]);

  const saveMood = async () => {
    if (!selectedMood) {
      Alert.alert('Select Mood', 'Please select how you are feeling today');
      return;
    }

    setLoading(true);
    Keyboard.dismiss();

    try {
      const response = await fetch(`${API_URL}/api/moods`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mood_type: selectedMood.type,
          mood_value: selectedMood.value,
          emoji: selectedMood.emoji,
          note: note.trim() || null,
          date: today,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setTodayMood(data);
        Alert.alert('Saved!', `Your mood for today has been ${todayMood ? 'updated' : 'recorded'}! ${selectedMood.emoji}`);
      } else {
        Alert.alert('Error', 'Failed to save mood. Please try again.');
      }
    } catch (error) {
      console.error('Error saving mood:', error);
      Alert.alert('Error', 'Failed to save mood. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  if (fetchingToday) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

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
          <View style={styles.header}>
            <Text style={styles.dateText}>{displayDate}</Text>
            <Text style={styles.title}>How are you feeling today?</Text>
          </View>

          <View style={styles.moodContainer}>
            {MOOD_OPTIONS.map((mood) => (
              <TouchableOpacity
                key={mood.type}
                style={[
                  styles.moodButton,
                  selectedMood?.type === mood.type && {
                    borderColor: mood.color,
                    backgroundColor: `${mood.color}20`,
                  },
                ]}
                onPress={() => setSelectedMood(mood)}
                activeOpacity={0.7}
              >
                <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                <Text
                  style={[
                    styles.moodLabel,
                    selectedMood?.type === mood.type && { color: mood.color },
                  ]}
                >
                  {mood.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.noteContainer}>
            <Text style={styles.noteLabel}>Add a note (optional)</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="What's on your mind?"
              placeholderTextColor="#6B7280"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.saveButton,
              !selectedMood && styles.saveButtonDisabled,
            ]}
            onPress={saveMood}
            disabled={loading || !selectedMood}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.saveButtonText}>
                {todayMood ? 'Update Mood' : 'Save Mood'}
              </Text>
            )}
          </TouchableOpacity>

          {todayMood && (
            <View style={styles.savedIndicator}>
              <Text style={styles.savedText}>
                Today's mood: {todayMood.emoji} {todayMood.mood_type.charAt(0).toUpperCase() + todayMood.mood_type.slice(1)}
              </Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
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
    padding: 20,
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
    marginBottom: 30,
    alignItems: 'center',
  },
  dateText: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  moodContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 30,
  },
  moodButton: {
    width: '28%',
    aspectRatio: 1,
    backgroundColor: '#1F2937',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  moodEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  moodLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  noteContainer: {
    marginBottom: 24,
  },
  noteLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  noteInput: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#374151',
  },
  saveButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 20,
  },
  saveButtonDisabled: {
    backgroundColor: '#4B5563',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  savedIndicator: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  savedText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
});
