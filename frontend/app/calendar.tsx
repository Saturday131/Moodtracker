import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
  startOfWeek,
  endOfWeek,
} from 'date-fns';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface MoodEntry {
  id: string;
  mood_type: string;
  mood_value: number;
  emoji: string;
  note: string | null;
  date: string;
}

const MOOD_COLORS: Record<string, string> = {
  great: '#22C55E',
  good: '#84CC16',
  okay: '#EAB308',
  low: '#F97316',
  bad: '#EF4444',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [moods, setMoods] = useState<MoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMood, setSelectedMood] = useState<MoodEntry | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchMoods = useCallback(async () => {
    try {
      setLoading(true);
      const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
      
      const response = await fetch(
        `${API_URL}/api/moods?start_date=${start}&end_date=${end}`
      );
      
      if (response.ok) {
        const data = await response.json();
        setMoods(data);
      }
    } catch (error) {
      console.error('Error fetching moods:', error);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useFocusEffect(
    useCallback(() => {
      fetchMoods();
    }, [fetchMoods])
  );

  const getMoodForDate = (date: Date): MoodEntry | undefined => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return moods.find(m => m.date === dateStr);
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
  };

  const handleDayPress = (mood: MoodEntry | undefined) => {
    if (mood) {
      setSelectedMood(mood);
      setModalVisible(true);
    }
  };

  const renderCalendar = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
    const today = new Date();

    return (
      <View style={styles.calendarGrid}>
        {/* Weekday Headers */}
        <View style={styles.weekdayRow}>
          {WEEKDAYS.map(day => (
            <View key={day} style={styles.weekdayCell}>
              <Text style={styles.weekdayText}>{day}</Text>
            </View>
          ))}
        </View>

        {/* Calendar Days */}
        <View style={styles.daysContainer}>
          {days.map((day, index) => {
            const mood = getMoodForDate(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isToday = isSameDay(day, today);

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayCell,
                  !isCurrentMonth && styles.otherMonthDay,
                  isToday && styles.todayCell,
                ]}
                onPress={() => handleDayPress(mood)}
                disabled={!mood}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    !isCurrentMonth && styles.otherMonthText,
                    isToday && styles.todayText,
                  ]}
                >
                  {format(day, 'd')}
                </Text>
                {mood && isCurrentMonth && (
                  <View
                    style={[
                      styles.moodDot,
                      { backgroundColor: MOOD_COLORS[mood.mood_type] },
                    ]}
                  >
                    <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderLegend = () => (
    <View style={styles.legend}>
      {Object.entries(MOOD_COLORS).map(([type, color]) => (
        <View key={type} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: color }]} />
          <Text style={styles.legendText}>
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Month Navigation */}
        <View style={styles.monthNavigation}>
          <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton}>
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={goToToday}>
            <Text style={styles.monthTitle}>
              {format(currentMonth, 'MMMM yyyy')}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={goToNextMonth} style={styles.navButton}>
            <Ionicons name="chevron-forward" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
          </View>
        ) : (
          <>
            {renderCalendar()}
            {renderLegend()}
            
            {/* Stats */}
            <View style={styles.statsCard}>
              <Text style={styles.statsTitle}>This Month</Text>
              <Text style={styles.statsValue}>
                {moods.length} mood{moods.length !== 1 ? 's' : ''} recorded
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Mood Detail Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            {selectedMood && (
              <>
                <Text style={styles.modalEmoji}>{selectedMood.emoji}</Text>
                <Text style={styles.modalDate}>
                  {format(new Date(selectedMood.date), 'EEEE, MMMM d, yyyy')}
                </Text>
                <Text style={styles.modalMoodType}>
                  Feeling {selectedMood.mood_type}
                </Text>
                {selectedMood.note && (
                  <View style={styles.modalNoteContainer}>
                    <Text style={styles.modalNoteLabel}>Note:</Text>
                    <Text style={styles.modalNote}>{selectedMood.note}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.modalCloseText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
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
  monthNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  navButton: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  calendarGrid: {
    paddingHorizontal: 10,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekdayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 2,
  },
  otherMonthDay: {
    opacity: 0.3,
  },
  todayCell: {
    backgroundColor: '#374151',
    borderRadius: 8,
  },
  dayNumber: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  otherMonthText: {
    color: '#6B7280',
  },
  todayText: {
    color: '#6366F1',
    fontWeight: 'bold',
  },
  moodDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  moodEmoji: {
    fontSize: 16,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 10,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  statsCard: {
    margin: 20,
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  statsTitle: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  statsValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderRadius: 20,
    padding: 30,
    width: '85%',
    alignItems: 'center',
  },
  modalEmoji: {
    fontSize: 60,
    marginBottom: 16,
  },
  modalDate: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  modalMoodType: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textTransform: 'capitalize',
    marginBottom: 16,
  },
  modalNoteContainer: {
    width: '100%',
    backgroundColor: '#374151',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  modalNoteLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  modalNote: {
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  modalCloseButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 40,
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
