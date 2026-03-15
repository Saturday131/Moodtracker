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
  created_at: string;
}

const CATEGORIES = [
  { key: 'zadania', label: 'Zadania', icon: 'checkbox-outline', color: '#F59E0B' },
  { key: 'przemyslenia', label: 'Przemyślenia', icon: 'bulb-outline', color: '#8B5CF6' },
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

  const saveNote = async () => {
    if (!newContent.trim()) {
      Alert.alert('Pusta notatka', 'Napisz coś zanim zapiszesz');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim() || null,
          text_content: newContent.trim(),
          category: newCategory,
          tags: [],
        }),
      });

      if (response.ok) {
        Alert.alert('Zapisano!', 'Twoja notatka została zapisana');
        setShowCreateModal(false);
        setNewTitle('');
        setNewContent('');
        setNewCategory('przemyslenia');
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

  const renderNote = (note: Note) => {
    const catInfo = getCategoryInfo(note.category);
    
    return (
      <TouchableOpacity
        key={note.id}
        style={styles.noteCard}
        onPress={() => {
          setSelectedNote(note);
          setShowDetailModal(true);
        }}
      >
        <View style={styles.noteHeader}>
          <View style={[styles.categoryBadge, { backgroundColor: catInfo.color + '20' }]}>
            <Ionicons name={catInfo.icon as any} size={14} color={catInfo.color} />
            <Text style={[styles.categoryText, { color: catInfo.color }]}>{catInfo.label}</Text>
          </View>
          <Text style={styles.noteDate}>{formatDate(note.created_at)}</Text>
        </View>
        
        {note.title && (
          <Text style={styles.noteTitle} numberOfLines={1}>{note.title}</Text>
        )}
        
        <Text style={styles.noteContent} numberOfLines={3}>
          {note.text_content}
        </Text>
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
        onRequestClose={() => setShowCreateModal(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
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

          {/* Category Selection */}
          <View style={styles.categorySelection}>
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
          <TextInput
            style={styles.titleInput}
            placeholder="Tytuł (opcjonalnie)"
            placeholderTextColor="#6B7280"
            value={newTitle}
            onChangeText={setNewTitle}
          />

          {/* Content Input */}
          <TextInput
            style={styles.contentInput}
            placeholder="Co chcesz zapisać?"
            placeholderTextColor="#6B7280"
            value={newContent}
            onChangeText={setNewContent}
            multiline
            textAlignVertical="top"
          />
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
                <Text style={styles.detailDate}>{formatDate(selectedNote.created_at)}</Text>
              </View>

              {selectedNote.title && (
                <Text style={styles.detailTitle}>{selectedNote.title}</Text>
              )}

              <Text style={styles.detailText}>{selectedNote.text_content}</Text>
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
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
  },
  noteDate: {
    color: '#6B7280',
    fontSize: 11,
  },
  noteTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  noteContent: {
    color: '#D1D5DB',
    fontSize: 14,
    lineHeight: 20,
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
  categorySelection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
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
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    padding: 16,
    paddingBottom: 8,
  },
  contentInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    padding: 16,
    paddingTop: 8,
    lineHeight: 24,
  },
  detailContent: {
    flex: 1,
    padding: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailDate: {
    color: '#6B7280',
    fontSize: 12,
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
});
