import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
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

interface Task {
  id: string;
  title: string | null;
  text_content: string | null;
  category: string;
  created_at: string;
}

const WEEKDAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
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

export default function CalendarScreen() {
  const router = useRouter();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [moods, setMoods] = useState<MoodEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

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

  const fetchTasks = async () => {
    try {
      const response = await fetch(`${API_URL}/api/notes/library?category=zadania`);
      if (response.ok) {
        const data = await response.json();
        setTasks(data.notes || []);
      }
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  useEffect(() => {
    fetchMoods();
    fetchTasks();
  }, [currentMonth]);

  const getMoodsForDate = (date: Date): MoodEntry[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return moods.filter(m => m.date === dateStr);
  };

  const getTasksForDate = (date: Date): Task[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return tasks.filter(task => {
      const taskDate = format(new Date(task.created_at), 'yyyy-MM-dd');
      return taskDate === dateStr;
    });
  };

  const getDayComposite = (dayMoods: MoodEntry[]): number | null => {
    if (dayMoods.length === 0) return null;
    const composites = dayMoods.map(m => calculateComposite(m.layers));
    return composites.reduce((a, b) => a + b, 0) / composites.length;
  };

  const handleDayPress = (date: Date) => {
    setSelectedDate(date);
  };

  const deleteTask = async (taskId: string) => {
    Alert.alert(
      'Usuń zadanie?',
      'Ta operacja jest nieodwracalna',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${API_URL}/api/notes/${taskId}`, { method: 'DELETE' });
              fetchTasks();
            } catch (error) {
              Alert.alert('Błąd', 'Nie udało się usunąć zadania');
            }
          },
        },
      ]
    );
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
            const dayTasks = getTasksForDate(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isToday = isSameDay(day, today);
            const isSelected = isSameDay(day, selectedDate);
            const composite = getDayComposite(dayMoods);
            const hasTasks = dayTasks.length > 0;

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.dayCell,
                  !isCurrentMonth && styles.otherMonthDay,
                  isToday && styles.todayCell,
                  isSelected && styles.selectedCell,
                ]}
                onPress={() => handleDayPress(day)}
              >
                <Text
                  style={[
                    styles.dayNumber,
                    !isCurrentMonth && styles.otherMonthText,
                    isToday && styles.todayText,
                    isSelected && styles.selectedText,
                  ]}
                >
                  {format(day, 'd')}
                </Text>
                
                {isCurrentMonth && (
                  <View style={styles.indicators}>
                    {composite !== null && (
                      <View style={[styles.moodDot, { backgroundColor: getScoreColor(composite) }]} />
                    )}
                    {hasTasks && (
                      <View style={styles.taskDot} />
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const selectedDateStr = format(selectedDate, 'EEEE, d MMMM', { locale: pl });
  const tasksForSelectedDate = getTasksForDate(selectedDate);
  const moodsForSelectedDate = getMoodsForDate(selectedDate);
  const selectedComposite = getDayComposite(moodsForSelectedDate);

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

        {/* Month Navigation */}
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
          renderCalendar()
        )}

        {/* Selected Day Info */}
        <View style={styles.selectedDaySection}>
          <Text style={styles.selectedDateTitle}>{selectedDateStr}</Text>
          
          {/* Mood Summary for Selected Day */}
          {selectedComposite !== null && (
            <View style={styles.moodSummaryCard}>
              <Ionicons name="happy-outline" size={20} color={getScoreColor(selectedComposite)} />
              <Text style={styles.moodSummaryText}>Nastrój:</Text>
              <Text style={[styles.moodSummaryValue, { color: getScoreColor(selectedComposite) }]}>
                {selectedComposite.toFixed(1)}/5
              </Text>
            </View>
          )}

          {/* Tasks Section */}
          <View style={styles.tasksSection}>
            <View style={styles.tasksSectionHeader}>
              <Ionicons name="checkbox-outline" size={20} color="#F59E0B" />
              <Text style={styles.tasksSectionTitle}>Zadania</Text>
              <Text style={styles.tasksCount}>({tasksForSelectedDate.length})</Text>
            </View>

            {tasksForSelectedDate.length === 0 ? (
              <View style={styles.noTasksContainer}>
                <Ionicons name="checkmark-done-outline" size={40} color="#4B5563" />
                <Text style={styles.noTasksText}>Brak zadań na ten dzień</Text>
                <TouchableOpacity 
                  style={styles.addTaskButton}
                  onPress={() => router.push('/notes')}
                >
                  <Ionicons name="add" size={18} color="#6366F1" />
                  <Text style={styles.addTaskButtonText}>Dodaj zadanie</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.tasksList}>
                {tasksForSelectedDate.map((task) => (
                  <View key={task.id} style={styles.taskCard}>
                    <View style={styles.taskContent}>
                      <View style={styles.taskCheckbox}>
                        <Ionicons name="square-outline" size={22} color="#F59E0B" />
                      </View>
                      <View style={styles.taskTextContainer}>
                        {task.title && (
                          <Text style={styles.taskTitle}>{task.title}</Text>
                        )}
                        {task.text_content && (
                          <Text style={styles.taskDescription} numberOfLines={2}>
                            {task.text_content}
                          </Text>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity 
                      style={styles.deleteTaskButton}
                      onPress={() => deleteTask(task.id)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* All Tasks Preview */}
          {tasks.length > 0 && tasksForSelectedDate.length === 0 && (
            <View style={styles.allTasksPreview}>
              <Text style={styles.allTasksTitle}>📋 Wszystkie zadania ({tasks.length})</Text>
              {tasks.slice(0, 3).map((task) => (
                <View key={task.id} style={styles.allTasksItem}>
                  <View style={styles.allTasksDot} />
                  <Text style={styles.allTasksText} numberOfLines={1}>
                    {task.title || task.text_content?.slice(0, 50)}
                  </Text>
                  <Text style={styles.allTasksDate}>
                    {format(new Date(task.created_at), 'd.MM', { locale: pl })}
                  </Text>
                </View>
              ))}
              <TouchableOpacity 
                style={styles.viewAllButton}
                onPress={() => router.push('/notes')}
              >
                <Text style={styles.viewAllButtonText}>Zobacz wszystkie</Text>
                <Ionicons name="arrow-forward" size={16} color="#6366F1" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
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
    paddingVertical: 60,
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
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  otherMonthDay: {
    opacity: 0.3,
  },
  todayCell: {
    backgroundColor: '#374151',
  },
  selectedCell: {
    backgroundColor: '#6366F1',
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
  selectedText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  indicators: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 4,
  },
  moodDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  taskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  selectedDaySection: {
    padding: 16,
  },
  selectedDateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  moodSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  moodSummaryText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  moodSummaryValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  tasksSection: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
  },
  tasksSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  tasksSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tasksCount: {
    fontSize: 14,
    color: '#6B7280',
  },
  noTasksContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  noTasksText: {
    color: '#6B7280',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 16,
  },
  addTaskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  addTaskButtonText: {
    color: '#6366F1',
    fontSize: 14,
    fontWeight: '500',
  },
  tasksList: {
    gap: 10,
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    padding: 12,
    borderRadius: 12,
  },
  taskContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  taskCheckbox: {
    marginRight: 10,
    marginTop: 2,
  },
  taskTextContainer: {
    flex: 1,
  },
  taskTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  taskDescription: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 18,
  },
  deleteTaskButton: {
    padding: 8,
  },
  allTasksPreview: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  allTasksTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
  },
  allTasksItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  allTasksDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  allTasksText: {
    flex: 1,
    color: '#D1D5DB',
    fontSize: 14,
  },
  allTasksDate: {
    color: '#6B7280',
    fontSize: 12,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    gap: 6,
  },
  viewAllButtonText: {
    color: '#6366F1',
    fontSize: 14,
    fontWeight: '500',
  },
});
