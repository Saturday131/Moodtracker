import React, { useState, useEffect } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
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

const WEEKDAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
const TIME_LABELS = {
  morning: { emoji: '🌅', label: 'Rano' },
  midday: { emoji: '☀️', label: 'Południe' },
  evening: { emoji: '🌙', label: 'Wieczór' },
};
const SCORE_COLORS = ['#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E'];

function calculateComposite(layers: MoodLayers): number {
  const weights = { overall: 0.3, energy: 0.2, stress: 0.2, productivity: 0.15, social: 0.15 };
  let total = 0;
  for (const [key, weight] of Object.entries(weights)) {
    total += (layers[key as keyof MoodLayers] || 3) * weight;
  }
  return Math.round(total * 10) / 10;
}

function getScoreColor(score: number): string {
  const index = Math.min(Math.max(Math.round(score) - 1, 0), 4);
  return SCORE_COLORS[index];
}

const LAYER_LABELS_PL: Record<string, string> = {
  overall: 'Ogólny',
  energy: 'Energia',
  stress: 'Spokój',
  productivity: 'Produktywność',
  social: 'Społeczny',
};

export default function CalendarScreen() {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [moods, setMoods] = useState<MoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedMoods, setSelectedMoods] = useState<MoodEntry[]>([]);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchMoods = async () => {
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
  };

  useEffect(() => {
    fetchMoods();
  }, [currentMonth]);

  const getMoodsForDate = (date: Date): MoodEntry[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return moods.filter(m => m.date === dateStr);
  };

  const getDayComposite = (dayMoods: MoodEntry[]): number | null => {
    if (dayMoods.length === 0) return null;
    const composites = dayMoods.map(m => calculateComposite(m.layers));
    return composites.reduce((a, b) => a + b, 0) / composites.length;
  };

  const handleDayPress = (date: Date) => {
    const dayMoods = getMoodsForDate(date);
    if (dayMoods.length > 0) {
      setSelectedDate(format(date, 'yyyy-MM-dd'));
      setSelectedMoods(dayMoods);
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
        <View style={styles.weekdayRow}>
          {WEEKDAYS.map(day => (
            <View key={day} style={styles.weekdayCell}>
              <Text style={styles.weekdayText}>{day}</Text>
            </View>
          ))}
        </View>

        <View style={styles.daysContainer}>
          {days.map((day, index) => {
            const dayMoods = getMoodsForDate(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isToday = isSameDay(day, today);
            const composite = getDayComposite(dayMoods);

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayCell,
                  !isCurrentMonth && styles.otherMonthDay,
                  isToday && styles.todayCell,
                ]}
                onPress={() => handleDayPress(day)}
                disabled={dayMoods.length === 0}
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
                
                {isCurrentMonth && dayMoods.length > 0 && (
                  <View style={styles.moodIndicators}>
                    <View style={styles.timeSlots}>
                      {['morning', 'midday', 'evening'].map((time) => {
                        const timeMood = dayMoods.find(m => m.time_of_day === time);
                        return (
                          <View
                            key={time}
                            style={[
                              styles.timeSlot,
                              timeMood && { backgroundColor: getScoreColor(calculateComposite(timeMood.layers)) },
                            ]}
                          />
                        );
                      })}
                    </View>
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
      <Text style={styles.legendTitle}>Kolory Wyników</Text>
      <View style={styles.legendRow}>
        {['Bardzo Niski', 'Niski', 'Średni', 'Dobry', 'Świetny'].map((label, i) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: SCORE_COLORS[i] }]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.timeSlotLegend}>
        <Text style={styles.legendSubtitle}>Pory dnia:</Text>
        <View style={styles.timeSlotExample}>
          <View style={[styles.timeSlot, { backgroundColor: '#22C55E' }]} />
          <View style={[styles.timeSlot, { backgroundColor: '#84CC16' }]} />
          <View style={[styles.timeSlot, { backgroundColor: '#EAB308' }]} />
        </View>
        <Text style={styles.legendHint}>Rano | Południe | Wieczór</Text>
      </View>
    </View>
  );

  const renderStats = () => {
    const totalEntries = moods.length;
    const uniqueDays = new Set(moods.map(m => m.date)).size;
    const avgComposite = totalEntries > 0
      ? moods.reduce((sum, m) => sum + calculateComposite(m.layers), 0) / totalEntries
      : 0;

    return (
      <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>Ten Miesiąc</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{uniqueDays}</Text>
            <Text style={styles.statLabel}>Dni</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalEntries}</Text>
            <Text style={styles.statLabel}>Wpisy</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: avgComposite > 0 ? getScoreColor(avgComposite) : '#9CA3AF' }]}>
              {avgComposite > 0 ? avgComposite.toFixed(1) : '-'}
            </Text>
            <Text style={styles.statLabel}>Średnia</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Trends Button */}
        <TouchableOpacity 
          style={styles.trendsButton}
          onPress={() => router.push('/trends')}
        >
          <Ionicons name="analytics" size={20} color="#6366F1" />
          <Text style={styles.trendsButtonText}>Zobacz Trendy i Analizy</Text>
          <Ionicons name="chevron-forward" size={20} color="#6366F1" />
        </TouchableOpacity>

        <View style={styles.monthNavigation}>
          <TouchableOpacity onPress={() => setCurrentMonth(subMonths(currentMonth, 1))} style={styles.navButton}>
            <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => setCurrentMonth(new Date())}>
            <Text style={styles.monthTitle}>
              {format(currentMonth, 'LLLL yyyy', { locale: pl })}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => setCurrentMonth(addMonths(currentMonth, 1))} style={styles.navButton}>
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
            {renderStats()}
          </>
        )}
      </ScrollView>

      {/* Day Detail Modal */}
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
            {selectedDate && (
              <>
                <Text style={styles.modalDate}>
                  {format(new Date(selectedDate), 'EEEE, d MMMM yyyy', { locale: pl })}
                </Text>
                
                {selectedMoods.map((mood) => (
                  <View key={mood.id} style={styles.modalMoodCard}>
                    <View style={styles.modalMoodHeader}>
                      <Text style={styles.modalTimeEmoji}>
                        {TIME_LABELS[mood.time_of_day as keyof typeof TIME_LABELS]?.emoji}
                      </Text>
                      <Text style={styles.modalTimeLabel}>
                        {TIME_LABELS[mood.time_of_day as keyof typeof TIME_LABELS]?.label}
                      </Text>
                      <Text style={[styles.modalComposite, { color: getScoreColor(calculateComposite(mood.layers)) }]}>
                        {calculateComposite(mood.layers).toFixed(1)}
                      </Text>
                    </View>
                    
                    <View style={styles.modalLayers}>
                      {Object.entries(mood.layers).map(([key, value]) => (
                        <View key={key} style={styles.modalLayerRow}>
                          <Text style={styles.modalLayerLabel}>
                            {LAYER_LABELS_PL[key] || key}
                          </Text>
                          <View style={styles.modalLayerBar}>
                            <View
                              style={[
                                styles.modalLayerFill,
                                { width: `${(value as number) * 20}%`, backgroundColor: getScoreColor(value as number) },
                              ]}
                            />
                          </View>
                          <Text style={styles.modalLayerValue}>{value}</Text>
                        </View>
                      ))}
                    </View>
                    
                    {mood.note && (
                      <View style={styles.modalNote}>
                        <Text style={styles.modalNoteText}>{mood.note}</Text>
                      </View>
                    )}
                  </View>
                ))}
                
                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.modalCloseText}>Zamknij</Text>
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
  trendsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6366F1',
    gap: 8,
  },
  trendsButtonText: {
    color: '#6366F1',
    fontSize: 15,
    fontWeight: '600',
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  loadingContainer: {
    paddingVertical: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarGrid: {
    paddingHorizontal: 8,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 0.9,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 4,
  },
  otherMonthDay: {
    opacity: 0.3,
  },
  todayCell: {
    backgroundColor: '#374151',
    borderRadius: 8,
  },
  dayNumber: {
    fontSize: 13,
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
  moodIndicators: {
    marginTop: 4,
    alignItems: 'center',
  },
  timeSlots: {
    flexDirection: 'row',
    gap: 2,
  },
  timeSlot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#374151',
  },
  legend: {
    padding: 16,
    marginTop: 8,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 8,
    textAlign: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  timeSlotLegend: {
    marginTop: 12,
    alignItems: 'center',
  },
  legendSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
  },
  timeSlotExample: {
    flexDirection: 'row',
    gap: 2,
  },
  legendHint: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 4,
  },
  statsCard: {
    margin: 16,
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
  },
  statsTitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalDate: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    textTransform: 'capitalize',
  },
  modalMoodCard: {
    backgroundColor: '#374151',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  modalMoodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTimeEmoji: {
    fontSize: 24,
    marginRight: 8,
  },
  modalTimeLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalComposite: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalLayers: {
    gap: 8,
  },
  modalLayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalLayerLabel: {
    width: 90,
    fontSize: 12,
    color: '#9CA3AF',
  },
  modalLayerBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#1F2937',
    borderRadius: 4,
    marginHorizontal: 8,
  },
  modalLayerFill: {
    height: '100%',
    borderRadius: 4,
  },
  modalLayerValue: {
    width: 20,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'right',
  },
  modalNote: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#1F2937',
    borderRadius: 8,
  },
  modalNoteText: {
    fontSize: 13,
    color: '#D1D5DB',
    fontStyle: 'italic',
  },
  modalCloseButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  modalCloseText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
