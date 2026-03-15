import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Note {
  id: string;
  title: string | null;
  text_content: string | null;
  category: string;
  tags: string[];
  is_completed: boolean;
  is_recurring: boolean;
  recurrence_pattern: string | null;
  scheduled_date: string | null;
  created_at: string;
}

const CATEGORIES = [
  { key: 'zadania', label: 'Zadania', icon: 'checkbox-outline', color: '#F59E0B' },
  { key: 'przemyslenia', label: 'Przemyślenia', icon: 'bulb-outline', color: '#8B5CF6' },
];

const RECURRENCE_OPTIONS = [
  { key: null, label: 'Nie powtarzaj', icon: 'close-circle-outline' },
  { key: 'daily', label: 'Codziennie', icon: 'today-outline' },
  { key: 'weekdays', label: 'Dni robocze', icon: 'briefcase-outline' },
  { key: 'weekly', label: 'Co tydzień', icon: 'calendar-outline' },
  { key: 'monthly', label: 'Co miesiąc', icon: 'calendar-number-outline' },
];

export default function NotesScreen() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Create note modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('przemyslenia');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  
  // View note modal
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const fetchNotes = async () => {
    try {
      if (!refreshing) setLoading(true);
      
      let url = `${API_URL}/api/notes/library?period=all`;
      if (selectedCategory) {
        url += `&category=${selectedCategory}`;
      }
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setNotes(data.notes || []);
      }
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, [selectedCategory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNotes();
  }, [selectedCategory]);

  const resetCreateForm = () => {
    setNewTitle('');
    setNewContent('');
    setNewCategory('przemyslenia');
    setIsRecurring(false);
    setRecurrencePattern(null);
    setScheduledDate(null);
  };

  const saveNote = async () => {
    if (!newContent.trim()) {
      Alert.alert('Pusta notatka', 'Napisz coś zanim zapiszesz');
      return;
    }

    setSaving(true);
    try {
      const noteData: any = {
        title: newTitle.trim() || null,
        text_content: newContent.trim(),
        category: newCategory,
        tags: [],
        is_recurring: isRecurring && newCategory === 'zadania',
        recurrence_pattern: isRecurring && newCategory === 'zadania' ? recurrencePattern : null,
        scheduled_date: scheduledDate,
      };

      const response = await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noteData),
      });

      if (response.ok) {
        Alert.alert('Zapisano!', 'Twoja notatka została zapisana');
        setShowCreateModal(false);
        resetCreateForm();
        fetchNotes();
      } else {
        Alert.alert('Błąd', 'Nie udało się zapisać notatki');
      }
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się połączyć z serwerem');
    } finally {
      setSaving(false);
    }
  };

  const toggleComplete = async (noteId: string, isCompleted: boolean) => {
    try {
      const endpoint = isCompleted ? 'uncomplete' : 'complete';
      await fetch(`${API_URL}/api/tasks/${noteId}/${endpoint}`, { method: 'PUT' });
      fetchNotes();
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się zaktualizować');
    }
  };

  const deleteNote = async (noteId: string) => {
    Alert.alert(
      'Usuń notatkę?',
      'Ta operacja jest nieodwracalna',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Usuń',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${API_URL}/api/notes/${noteId}`, { method: 'DELETE' });
              setShowDetailModal(false);
              setSelectedNote(null);
              fetchNotes();
            } catch (error) {
              Alert.alert('Błąd', 'Nie udało się usunąć notatki');
            }
          },
        },
      ]
    );
  };

  const getCategoryInfo = (category: string) => {
    return CATEGORIES.find(c => c.key === category) || CATEGORIES[1];
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'd MMM yyyy, HH:mm', { locale: pl });
    } catch {
      return dateString;
    }
  };

  const getRecurrenceLabel = (pattern: string | null) => {
    const option = RECURRENCE_OPTIONS.find(o => o.key === pattern);
    return option?.label || pattern;
  };

  const renderNote = (note: Note) => {
    const catInfo = getCategoryInfo(note.category);
    const isTask = note.category === 'zadania';
    
    return (
      <TouchableOpacity
        key={note.id}
        style={[styles.noteCard, note.is_completed && styles.noteCardCompleted]}
        onPress={() => {
          setSelectedNote(note);
          setShowDetailModal(true);
        }}
      >
        <View style={styles.noteRow}>
          {isTask && (
            <TouchableOpacity 
              style={styles.noteCheckbox}
              onPress={() => toggleComplete(note.id, note.is_completed)}
            >
              <Ionicons 
                name={note.is_completed ? "checkbox" : "square-outline"} 
                size={22} 
                color={note.is_completed ? "#22C55E" : "#F59E0B"} 
              />
            </TouchableOpacity>
          )}
          
          <View style={styles.noteMainContent}>
            <View style={styles.noteHeader}>
              <View style={[styles.categoryBadge, { backgroundColor: catInfo.color + '20' }]}>
                <Ionicons name={catInfo.icon as any} size={12} color={catInfo.color} />
                <Text style={[styles.categoryText, { color: catInfo.color }]}>{catInfo.label}</Text>
              </View>
              {note.is_recurring && (
                <View style={styles.recurringBadge}>
                  <Ionicons name="repeat" size={12} color="#8B5CF6" />
                </View>
              )}
              <Text style={styles.noteDate}>{formatDate(note.created_at)}</Text>
            </View>
            
            {note.title && (
              <Text style={[styles.noteTitle, note.is_completed && styles.textCompleted]} numberOfLines={1}>
                {note.title}
              </Text>
            )}
            
            <Text style={[styles.noteContent, note.is_completed && styles.textCompleted]} numberOfLines={2}>
              {note.text_content}
            </Text>
            
            {note.is_recurring && note.recurrence_pattern && (
              <Text style={styles.recurrenceInfo}>
                🔄 {getRecurrenceLabel(note.recurrence_pattern)}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Ładowanie notatek...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Category Filter */}
      <View style={styles.categoryFilter}>
        <TouchableOpacity
          style={[
            styles.filterButton,
            !selectedCategory && styles.filterButtonActive,
          ]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text style={[
            styles.filterText,
            !selectedCategory && styles.filterTextActive,
          ]}>Wszystkie</Text>
        </TouchableOpacity>
        
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            style={[
              styles.filterButton,
              selectedCategory === cat.key && styles.filterButtonActive,
              selectedCategory === cat.key && { borderColor: cat.color },
            ]}
            onPress={() => setSelectedCategory(cat.key)}
          >
            <Ionicons 
              name={cat.icon as any} 
              size={16} 
              color={selectedCategory === cat.key ? cat.color : '#9CA3AF'} 
            />
            <Text style={[
              styles.filterText,
              selectedCategory === cat.key && { color: cat.color },
            ]}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Notes List */}
      <ScrollView
        style={styles.notesList}
        contentContainerStyle={styles.notesContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />
        }
      >
        {notes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={60} color="#4B5563" />
            <Text style={styles.emptyTitle}>Brak notatek</Text>
            <Text style={styles.emptyText}>
              Dodaj swoją pierwszą notatkę klikając przycisk poniżej
            </Text>
          </View>
        ) : (
          notes.map(renderNote)
        )}
      </ScrollView>

      {/* Add Note Button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowCreateModal(true)}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Create Note Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowCreateModal(false);
          resetCreateForm();
        }}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => {
              setShowCreateModal(false);
              resetCreateForm();
            }}>
              <Text style={styles.cancelText}>Anuluj</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Nowa notatka</Text>
            <TouchableOpacity onPress={saveNote} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#6366F1" />
              ) : (
                <Text style={styles.saveText}>Zapisz</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Category Selection */}
            <View style={styles.formSection}>
              <Text style={styles.sectionLabel}>Kategoria</Text>
              <View style={styles.categoryButtons}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[
                      styles.categorySelectButton,
                      newCategory === cat.key && { 
                        backgroundColor: cat.color + '20',
                        borderColor: cat.color,
                      },
                    ]}
                    onPress={() => setNewCategory(cat.key)}
                  >
                    <Ionicons 
                      name={cat.icon as any} 
                      size={20} 
                      color={newCategory === cat.key ? cat.color : '#9CA3AF'} 
                    />
                    <Text style={[
                      styles.categorySelectText,
                      newCategory === cat.key && { color: cat.color },
                    ]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Title Input */}
            <View style={styles.formSection}>
              <Text style={styles.sectionLabel}>Tytuł (opcjonalnie)</Text>
              <TextInput
                style={styles.titleInput}
                placeholder="Np. Spotkanie z lekarzem"
                placeholderTextColor="#6B7280"
                value={newTitle}
                onChangeText={setNewTitle}
              />
            </View>

            {/* Content Input */}
            <View style={styles.formSection}>
              <Text style={styles.sectionLabel}>Treść</Text>
              <TextInput
                style={styles.contentInput}
                placeholder="Co chcesz zapisać?"
                placeholderTextColor="#6B7280"
                value={newContent}
                onChangeText={setNewContent}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Recurring Task Options (only for tasks) */}
            {newCategory === 'zadania' && (
              <View style={styles.formSection}>
                <View style={styles.recurringHeader}>
                  <Ionicons name="repeat" size={20} color="#8B5CF6" />
                  <Text style={styles.sectionLabel}>Zadanie powtarzalne</Text>
                  <Switch
                    value={isRecurring}
                    onValueChange={setIsRecurring}
                    trackColor={{ false: '#374151', true: '#8B5CF6' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                
                {isRecurring && (
                  <View style={styles.recurrenceOptions}>
                    {RECURRENCE_OPTIONS.filter(o => o.key !== null).map((option) => (
                      <TouchableOpacity
                        key={option.key}
                        style={[
                          styles.recurrenceOption,
                          recurrencePattern === option.key && styles.recurrenceOptionActive,
                        ]}
                        onPress={() => setRecurrencePattern(option.key)}
                      >
                        <Ionicons 
                          name={option.icon as any} 
                          size={18} 
                          color={recurrencePattern === option.key ? '#8B5CF6' : '#9CA3AF'} 
                        />
                        <Text style={[
                          styles.recurrenceOptionText,
                          recurrencePattern === option.key && styles.recurrenceOptionTextActive,
                        ]}>{option.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Info about recurring tasks */}
            {newCategory === 'zadania' && isRecurring && (
              <View style={styles.infoBox}>
                <Ionicons name="information-circle-outline" size={18} color="#6B7280" />
                <Text style={styles.infoText}>
                  Zadania powtarzalne będą automatycznie pojawiać się w kalendarzu zgodnie z wybranym harmonogramem.
                </Text>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* View Note Modal */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDetailModal(false)}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Notatka</Text>
            <TouchableOpacity onPress={() => selectedNote && deleteNote(selectedNote.id)}>
              <Ionicons name="trash-outline" size={24} color="#EF4444" />
            </TouchableOpacity>
          </View>

          {selectedNote && (
            <ScrollView style={styles.detailContent}>
              <View style={styles.detailHeader}>
                <View style={[
                  styles.categoryBadge, 
                  { backgroundColor: getCategoryInfo(selectedNote.category).color + '20' }
                ]}>
                  <Ionicons 
                    name={getCategoryInfo(selectedNote.category).icon as any} 
                    size={14} 
                    color={getCategoryInfo(selectedNote.category).color} 
                  />
                  <Text style={[
                    styles.categoryText, 
                    { color: getCategoryInfo(selectedNote.category).color }
                  ]}>
                    {getCategoryInfo(selectedNote.category).label}
                  </Text>
                </View>
                {selectedNote.is_recurring && (
                  <View style={[styles.categoryBadge, { backgroundColor: '#8B5CF620' }]}>
                    <Ionicons name="repeat" size={14} color="#8B5CF6" />
                    <Text style={[styles.categoryText, { color: '#8B5CF6' }]}>
                      {getRecurrenceLabel(selectedNote.recurrence_pattern)}
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.detailDate}>{formatDate(selectedNote.created_at)}</Text>

              {selectedNote.title && (
                <Text style={styles.detailTitle}>{selectedNote.title}</Text>
              )}

              <Text style={styles.detailText}>{selectedNote.text_content}</Text>

              {selectedNote.category === 'zadania' && (
                <TouchableOpacity
                  style={[
                    styles.completeButton,
                    selectedNote.is_completed && styles.completeButtonDone
                  ]}
                  onPress={() => {
                    toggleComplete(selectedNote.id, selectedNote.is_completed);
                    setSelectedNote({
                      ...selectedNote,
                      is_completed: !selectedNote.is_completed
                    });
                  }}
                >
                  <Ionicons 
                    name={selectedNote.is_completed ? "checkbox" : "square-outline"} 
                    size={22} 
                    color={selectedNote.is_completed ? "#22C55E" : "#F59E0B"} 
                  />
                  <Text style={[
                    styles.completeButtonText,
                    selectedNote.is_completed && styles.completeButtonTextDone
                  ]}>
                    {selectedNote.is_completed ? "Wykonane" : "Oznacz jako wykonane"}
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
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
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 16,
  },
  categoryFilter: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 6,
  },
  filterButtonActive: {
    borderColor: '#6366F1',
  },
  filterText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#6366F1',
  },
  notesList: {
    flex: 1,
  },
  notesContent: {
    padding: 16,
    paddingBottom: 100,
  },
  noteCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  noteCardCompleted: {
    opacity: 0.6,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  noteCheckbox: {
    marginRight: 10,
    marginTop: 2,
  },
  noteMainContent: {
    flex: 1,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
  },
  recurringBadge: {
    padding: 4,
  },
  noteDate: {
    color: '#6B7280',
    fontSize: 11,
    marginLeft: 'auto',
  },
  noteTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  noteContent: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
  },
  textCompleted: {
    textDecorationLine: 'line-through',
    color: '#6B7280',
  },
  recurrenceInfo: {
    color: '#8B5CF6',
    fontSize: 12,
    marginTop: 6,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  addButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#111827',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  cancelText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  saveText: {
    color: '#6366F1',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  formSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    color: '#9CA3AF',
    fontSize: 13,
    marginBottom: 10,
  },
  categoryButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  categorySelectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 8,
  },
  categorySelectText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '500',
  },
  titleInput: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  contentInput: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 16,
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#374151',
  },
  recurringHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recurrenceOptions: {
    marginTop: 12,
    gap: 8,
  },
  recurrenceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 10,
  },
  recurrenceOptionActive: {
    borderColor: '#8B5CF6',
    backgroundColor: '#8B5CF610',
  },
  recurrenceOptionText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  recurrenceOptionTextActive: {
    color: '#8B5CF6',
    fontWeight: '500',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  infoText: {
    flex: 1,
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 20,
  },
  detailContent: {
    flex: 1,
    padding: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  detailDate: {
    color: '#6B7280',
    fontSize: 12,
    marginBottom: 16,
  },
  detailTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  detailText: {
    color: '#D1D5DB',
    fontSize: 16,
    lineHeight: 26,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
    padding: 14,
    borderRadius: 12,
    marginTop: 24,
    gap: 10,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  completeButtonDone: {
    borderColor: '#22C55E',
    backgroundColor: '#22C55E10',
  },
  completeButtonText: {
    color: '#F59E0B',
    fontSize: 15,
    fontWeight: '600',
  },
  completeButtonTextDone: {
    color: '#22C55E',
  },
});
