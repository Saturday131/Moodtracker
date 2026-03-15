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
  is_completed: boolean;
  is_recurring: boolean;
  recurrence_pattern: string | null;
  scheduled_date: string | null;
  parent_task_id: string | null;
  created_at: string;
}

const WEEKDAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
const SCORE_COLORS = ['#EF4444', '#F97316', '#EAB308', '#84CC16', '#22C55E'];

const RECURRENCE_LABELS: Record<string, string> = {
  daily: 'Codziennie',
  weekdays: 'Dni robocze',
  weekly: 'Co tydzień',
  monthly: 'Co miesiąc',
};

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
  const [tasksForDay, setTasksForDay] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

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

  const fetchAllTasks = async () => {
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

  const fetchTasksForDate = async (date: Date) => {
    setLoadingTasks(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const response = await fetch(`${API_URL}/api/tasks/for-date/${dateStr}`);
      if (response.ok) {
        const data = await response.json();
        setTasksForDay(data);
      }
    } catch (error) {
      console.error('Error fetching tasks for date:', error);
      // Fallback to filtering from all tasks
      const dateStr = format(date, 'yyyy-MM-dd');
      const filtered = tasks.filter(task => {
        const taskDate = task.scheduled_date || format(new Date(task.created_at), 'yyyy-MM-dd');
        return taskDate === dateStr;
      });
      setTasksForDay(filtered);
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    fetchMoods();
    fetchAllTasks();
  }, [currentMonth]);

  useEffect(() => {
    fetchTasksForDate(selectedDate);
  }, [selectedDate, tasks]);

  const getMoodsForDate = (date: Date): MoodEntry[] => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return moods.filter(m => m.date === dateStr);
  };

  const hasTasksForDate = (date: Date): boolean => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return tasks.some(task => {
      const taskDate = task.scheduled_date || format(new Date(task.created_at), 'yyyy-MM-dd');
      return taskDate === dateStr;
    }) || tasks.some(task => task.is_recurring);
  };

  const getDayComposite = (dayMoods: MoodEntry[]): number | null => {
    if (dayMoods.length === 0) return null;
    const composites = dayMoods.map(m => calculateComposite(m.layers));
    return composites.reduce((a, b) => a + b, 0) / composites.length;
  };

  const handleDayPress = (date: Date) => {
    setSelectedDate(date);
  };

  const toggleTaskComplete = async (taskId: string, isCompleted: boolean) => {
    try {
      const endpoint = isCompleted ? 'uncomplete' : 'complete';
      const response = await fetch(`${API_URL}/api/tasks/${taskId}/${endpoint}`, {
        method: 'PUT',
      });
      
      if (response.ok) {
        // Refresh tasks
        fetchTasksForDate(selectedDate);
        fetchAllTasks();
      } else {
        Alert.alert('Błąd', 'Nie udało się zaktualizować zadania');
      }
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się połączyć z serwerem');
    }
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
              fetchTasksForDate(selectedDate);
              fetchAllTasks();
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
            const hasTasks = hasTasksForDate(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isToday = isSameDay(day, today);
            const isSelected = isSameDay(day, selectedDate);
            const composite = getDayComposite(dayMoods);

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
              <Text style={styles.tasksCount}>({tasksForDay.length})</Text>
            </View>

            {loadingTasks ? (
              <ActivityIndicator size="small" color="#6366F1" style={{ paddingVertical: 20 }} />
            ) : tasksForDay.length === 0 ? (
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
                {tasksForDay.map((task) => (
                  <View key={task.id} style={[
                    styles.taskCard,
                    task.is_completed && styles.taskCardCompleted
                  ]}>
                    <TouchableOpacity 
                      style={styles.taskCheckbox}
                      onPress={() => toggleTaskComplete(task.id, task.is_completed)}
                    >
                      <Ionicons 
                        name={task.is_completed ? "checkbox" : "square-outline"} 
                        size={24} 
                        color={task.is_completed ? "#22C55E" : "#F59E0B"} 
                      />
                    </TouchableOpacity>
                    
                    <View style={styles.taskContent}>
                      <View style={styles.taskTextContainer}>
                        {task.title && (
                          <Text style={[
                            styles.taskTitle,
                            task.is_completed && styles.taskTitleCompleted
                          ]}>{task.title}</Text>
                        )}
                        {task.text_content && (
                          <Text style={[
                            styles.taskDescription,
                            task.is_completed && styles.taskDescriptionCompleted
                          ]} numberOfLines={2}>
                            {task.text_content}
                          </Text>
                        )}
                        {task.is_recurring && task.recurrence_pattern && (
                          <View style={styles.recurringBadge}>
                            <Ionicons name="repeat" size={12} color="#8B5CF6" />
                            <Text style={styles.recurringText}>
                              {RECURRENCE_LABELS[task.recurrence_pattern] || task.recurrence_pattern}
                            </Text>
                          </View>
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

          {/* Chat tip for task management */}
          <View style={styles.tipCard}>
            <Ionicons name="bulb-outline" size={18} color="#F59E0B" />
            <Text style={styles.tipText}>
              Możesz zarządzać zadaniami przez czat! Napisz np. "Dodaj codzienne zadanie: wyprowadź psa" lub "Przesuń spotkanie na piątek"
            </Text>
          </View>
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
  taskCardCompleted: {
    backgroundColor: '#1F2937',
    opacity: 0.7,
  },
  taskCheckbox: {
    marginRight: 10,
  },
  taskContent: {
    flex: 1,
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
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#6B7280',
  },
  taskDescription: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 18,
  },
  taskDescriptionCompleted: {
    textDecorationLine: 'line-through',
    color: '#4B5563',
  },
  recurringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  recurringText: {
    color: '#8B5CF6',
    fontSize: 11,
    fontWeight: '500',
  },
  deleteTaskButton: {
    padding: 8,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#374151',
  },
  tipText: {
    flex: 1,
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 20,
  },
});
