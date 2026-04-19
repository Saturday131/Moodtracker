import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from './auth-context';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Note {
  id: string;
  title: string | null;
  text_content: string | null;
  voice_base64: string | null;
  image_base64: string | null;
  category: string;
  tags: string[];
  is_completed: boolean;
  is_recurring: boolean;
  recurrence_pattern: string | null;
  recurrence_days: number[];
  recurrence_end_date: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
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
  { key: 'custom', label: 'Wybrane dni', icon: 'options-outline' },
];

const DAY_LABELS = [
  { key: 0, short: 'Pn' },
  { key: 1, short: 'Wt' },
  { key: 2, short: 'Śr' },
  { key: 3, short: 'Cz' },
  { key: 4, short: 'Pt' },
  { key: 5, short: 'So' },
  { key: 6, short: 'Nd' },
];

export default function NotesScreen() {
  const { authHeaders } = useAuth();
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
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [saving, setSaving] = useState(false);

  // View note modal
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Media
  const [voiceBase64, setVoiceBase64] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [playingNoteId, setPlayingNoteId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Brak uprawnień', 'Zezwól na dostęp do mikrofonu');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      durationInterval.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
    } catch (err) {
      Alert.alert('Błąd', 'Nie udało się rozpocząć nagrywania');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;
    try {
      if (durationInterval.current) clearInterval(durationInterval.current);
      setIsRecording(false);
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (uri) {
        const response = await fetch(uri);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          setVoiceBase64(base64);
        };
        reader.readAsDataURL(blob);
      }
    } catch (err) {
      Alert.alert('Błąd', 'Nie udało się zatrzymać nagrywania');
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.5,
        base64: true,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets[0].base64) {
        setImageBase64(result.assets[0].base64);
      }
    } catch (err) {
      Alert.alert('Błąd', 'Nie udało się wybrać zdjęcia');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Brak uprawnień', 'Zezwól na dostęp do aparatu');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.5,
        base64: true,
        allowsEditing: true,
      });
      if (!result.canceled && result.assets[0].base64) {
        setImageBase64(result.assets[0].base64);
      }
    } catch (err) {
      Alert.alert('Błąd', 'Nie udało się zrobić zdjęcia');
    }
  };

  const playVoice = async (base64: string, noteId: string) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (playingNoteId === noteId) {
        setPlayingNoteId(null);
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/m4a;base64,${base64}` },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setPlayingNoteId(noteId);
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          setPlayingNoteId(null);
          sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch (err) {
      Alert.alert('Błąd', 'Nie udało się odtworzyć nagrania');
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const fetchNotes = async () => {
    try {
      if (!refreshing) setLoading(true);

      let url = `${API_URL}/api/notes/library?period=all`;
      if (selectedCategory) {
        url += `&category=${selectedCategory}`;
      }

      const response = await fetch(url, { headers: authHeaders() });
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
    setRecurrenceDays([]);
    setRecurrenceEndDate('');
    setScheduledDate('');
    setScheduledTime('');
    setVoiceBase64(null);
    setImageBase64(null);
    setRecordingDuration(0);
  };

  const saveNote = async () => {
    if (!newContent.trim() && !voiceBase64 && !imageBase64) {
      Alert.alert('Pusta notatka', 'Dodaj treść, nagranie lub zdjęcie');
      return;
    }

    setSaving(true);
    try {
      const isTask = newCategory === 'zadania';
      const noteData: any = {
        title: newTitle.trim() || null,
        text_content: newContent.trim() || null,
        category: newCategory,
        tags: [],
        voice_base64: voiceBase64,
        image_base64: imageBase64,
        is_recurring: isTask && isRecurring,
        recurrence_pattern: isTask && isRecurring ? recurrencePattern : null,
        recurrence_days: isTask && isRecurring && recurrencePattern === 'custom' ? recurrenceDays : [],
        recurrence_end_date: isTask && isRecurring && recurrenceEndDate ? recurrenceEndDate : null,
        scheduled_date: isTask && scheduledDate ? scheduledDate : null,
        scheduled_time: isTask && scheduledTime ? scheduledTime : null,
      };

      const response = await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
      await fetch(`${API_URL}/api/tasks/${noteId}/${endpoint}`, { method: 'PUT', headers: authHeaders() });
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
              await fetch(`${API_URL}/api/notes/${noteId}`, { method: 'DELETE', headers: authHeaders() });
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

  const toggleDay = (day: number) => {
    setRecurrenceDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
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

  const getDaysLabel = (days: number[]) => {
    if (!days || days.length === 0) return '';
    return days.map(d => DAY_LABELS.find(l => l.key === d)?.short || '').join(', ');
  };

  const renderNote = (note: Note) => {
    const catInfo = getCategoryInfo(note.category);
    const isTask = note.category === 'zadania';

    return (
      <TouchableOpacity
        key={note.id}
        data-testid={`note-card-${note.id}`}
        style={[styles.noteCard, note.is_completed && styles.noteCardCompleted]}
        onPress={() => {
          setSelectedNote(note);
          setShowDetailModal(true);
        }}
      >
        <View style={styles.noteRow}>
          {isTask && (
            <TouchableOpacity
              data-testid={`note-checkbox-${note.id}`}
              style={styles.noteCheckbox}
              onPress={() => toggleComplete(note.id, note.is_completed)}
            >
              <Ionicons
                name={note.is_completed ? 'checkbox' : 'square-outline'}
                size={22}
                color={note.is_completed ? '#22C55E' : '#F59E0B'}
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
              {note.scheduled_time && (
                <View style={styles.timeBadge}>
                  <Ionicons name="time-outline" size={12} color="#3B82F6" />
                  <Text style={styles.timeText}>{note.scheduled_time}</Text>
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

            {/* Media indicators */}
            {(note.voice_base64 || note.image_base64) && (
              <View style={styles.mediaIndicators}>
                {note.voice_base64 && (
                  <TouchableOpacity
                    style={styles.mediaChip}
                    onPress={() => playVoice(note.voice_base64!, note.id)}
                  >
                    <Ionicons
                      name={playingNoteId === note.id ? 'pause' : 'play'}
                      size={14}
                      color="#22C55E"
                    />
                    <Text style={styles.mediaChipText}>Nagranie</Text>
                  </TouchableOpacity>
                )}
                {note.image_base64 && (
                  <View style={styles.mediaChip}>
                    <Ionicons name="image" size={14} color="#3B82F6" />
                    <Text style={[styles.mediaChipText, { color: '#60A5FA' }]}>Zdjęcie</Text>
                  </View>
                )}
              </View>
            )}

            {note.is_recurring && note.recurrence_pattern && (
              <View style={styles.recurrenceInfoRow}>
                <Ionicons name="repeat" size={12} color="#8B5CF6" />
                <Text style={styles.recurrenceInfo}>
                  {getRecurrenceLabel(note.recurrence_pattern)}
                  {note.recurrence_pattern === 'custom' && note.recurrence_days?.length > 0
                    ? ` (${getDaysLabel(note.recurrence_days)})`
                    : ''}
                </Text>
                {note.recurrence_end_date && (
                  <Text style={styles.recurrenceEndInfo}>do {note.recurrence_end_date}</Text>
                )}
              </View>
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
          data-testid="filter-all"
          style={[styles.filterButton, !selectedCategory && styles.filterButtonActive]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text style={[styles.filterText, !selectedCategory && styles.filterTextActive]}>
            Wszystkie
          </Text>
        </TouchableOpacity>

        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.key}
            data-testid={`filter-${cat.key}`}
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
            <Text style={[styles.filterText, selectedCategory === cat.key && { color: cat.color }]}>
              {cat.label}
            </Text>
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
        data-testid="add-note-button"
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
            <TouchableOpacity
              data-testid="create-modal-cancel"
              onPress={() => {
                setShowCreateModal(false);
                resetCreateForm();
              }}
            >
              <Text style={styles.cancelText}>Anuluj</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Nowa notatka</Text>
            <TouchableOpacity data-testid="create-modal-save" onPress={saveNote} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#6366F1" />
              ) : (
                <Text style={styles.saveText}>Zapisz</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
            {/* Category Selection */}
            <View style={styles.formSection}>
              <Text style={styles.sectionLabel}>Kategoria</Text>
              <View style={styles.categoryButtons}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.key}
                    data-testid={`category-${cat.key}`}
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
                    <Text
                      style={[
                        styles.categorySelectText,
                        newCategory === cat.key && { color: cat.color },
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Title Input */}
            <View style={styles.formSection}>
              <Text style={styles.sectionLabel}>Tytuł (opcjonalnie)</Text>
              <TextInput
                data-testid="note-title-input"
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
                data-testid="note-content-input"
                style={styles.contentInput}
                placeholder="Co chcesz zapisać?"
                placeholderTextColor="#6B7280"
                value={newContent}
                onChangeText={setNewContent}
                multiline
                textAlignVertical="top"
              />
            </View>

            {/* Media Attachments */}
            <View style={styles.formSection}>
              <Text style={styles.sectionLabel}>Załączniki</Text>
              <View style={styles.mediaButtonsRow}>
                {/* Voice Recording */}
                <TouchableOpacity
                  data-testid="record-voice-button"
                  style={[styles.mediaButton, isRecording && styles.mediaButtonActive]}
                  onPress={isRecording ? stopRecording : startRecording}
                >
                  <Ionicons
                    name={isRecording ? 'stop-circle' : 'mic'}
                    size={22}
                    color={isRecording ? '#EF4444' : '#22C55E'}
                  />
                  <Text style={[styles.mediaButtonText, isRecording && { color: '#EF4444' }]}>
                    {isRecording ? `Nagrywanie ${formatDuration(recordingDuration)}` : 'Nagraj głos'}
                  </Text>
                </TouchableOpacity>

                {/* Image Picker */}
                <TouchableOpacity
                  data-testid="pick-image-button"
                  style={styles.mediaButton}
                  onPress={pickImage}
                >
                  <Ionicons name="images" size={22} color="#3B82F6" />
                  <Text style={styles.mediaButtonText}>Galeria</Text>
                </TouchableOpacity>

                {/* Camera */}
                <TouchableOpacity
                  data-testid="take-photo-button"
                  style={styles.mediaButton}
                  onPress={takePhoto}
                >
                  <Ionicons name="camera" size={22} color="#F59E0B" />
                  <Text style={styles.mediaButtonText}>Aparat</Text>
                </TouchableOpacity>
              </View>

              {/* Voice preview */}
              {voiceBase64 && (
                <View style={styles.mediaPreview}>
                  <Ionicons name="musical-notes" size={18} color="#22C55E" />
                  <Text style={styles.mediaPreviewText}>Nagranie dołączone</Text>
                  <TouchableOpacity onPress={() => setVoiceBase64(null)}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Image preview */}
              {imageBase64 && (
                <View style={styles.mediaPreview}>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${imageBase64}` }}
                    style={styles.imagePreviewThumb}
                  />
                  <Text style={styles.mediaPreviewText}>Zdjęcie dołączone</Text>
                  <TouchableOpacity onPress={() => setImageBase64(null)}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Task Scheduling Options */}
            {newCategory === 'zadania' && (
              <>
                {/* Scheduled Date */}
                <View style={styles.formSection}>
                  <View style={styles.fieldRow}>
                    <Ionicons name="calendar-outline" size={18} color="#3B82F6" />
                    <Text style={styles.sectionLabel}>Data zadania</Text>
                  </View>
                  <TextInput
                    data-testid="scheduled-date-input"
                    style={styles.titleInput}
                    placeholder="RRRR-MM-DD (np. 2026-02-20)"
                    placeholderTextColor="#6B7280"
                    value={scheduledDate}
                    onChangeText={setScheduledDate}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>

                {/* Scheduled Time */}
                <View style={styles.formSection}>
                  <View style={styles.fieldRow}>
                    <Ionicons name="time-outline" size={18} color="#3B82F6" />
                    <Text style={styles.sectionLabel}>Godzina</Text>
                  </View>
                  <TextInput
                    data-testid="scheduled-time-input"
                    style={styles.titleInput}
                    placeholder="GG:MM (np. 14:30)"
                    placeholderTextColor="#6B7280"
                    value={scheduledTime}
                    onChangeText={setScheduledTime}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>

                {/* Recurring Toggle */}
                <View style={styles.formSection}>
                  <View style={styles.recurringHeader}>
                    <Ionicons name="repeat" size={20} color="#8B5CF6" />
                    <Text style={styles.sectionLabel}>Zadanie powtarzalne</Text>
                    <Switch
                      data-testid="recurring-toggle"
                      value={isRecurring}
                      onValueChange={setIsRecurring}
                      trackColor={{ false: '#374151', true: '#8B5CF6' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  {isRecurring && (
                    <View style={styles.recurrenceOptions}>
                      {RECURRENCE_OPTIONS.filter(o => o.key !== null).map(option => (
                        <TouchableOpacity
                          key={option.key}
                          data-testid={`recurrence-${option.key}`}
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
                          <Text
                            style={[
                              styles.recurrenceOptionText,
                              recurrencePattern === option.key && styles.recurrenceOptionTextActive,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Custom Days Selector */}
                {isRecurring && recurrencePattern === 'custom' && (
                  <View style={styles.formSection}>
                    <Text style={styles.sectionLabel}>Wybierz dni tygodnia</Text>
                    <View style={styles.daysRow}>
                      {DAY_LABELS.map(day => (
                        <TouchableOpacity
                          key={day.key}
                          data-testid={`day-${day.key}`}
                          style={[
                            styles.dayChip,
                            recurrenceDays.includes(day.key) && styles.dayChipActive,
                          ]}
                          onPress={() => toggleDay(day.key)}
                        >
                          <Text
                            style={[
                              styles.dayChipText,
                              recurrenceDays.includes(day.key) && styles.dayChipTextActive,
                            ]}
                          >
                            {day.short}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* Recurrence End Date */}
                {isRecurring && recurrencePattern && (
                  <View style={styles.formSection}>
                    <View style={styles.fieldRow}>
                      <Ionicons name="flag-outline" size={18} color="#EF4444" />
                      <Text style={styles.sectionLabel}>Data końca powtarzania</Text>
                    </View>
                    <TextInput
                      data-testid="recurrence-end-date-input"
                      style={styles.titleInput}
                      placeholder="RRRR-MM-DD (opcjonalnie)"
                      placeholderTextColor="#6B7280"
                      value={recurrenceEndDate}
                      onChangeText={setRecurrenceEndDate}
                      keyboardType="numbers-and-punctuation"
                    />
                    <Text style={styles.helperText}>
                      Zostaw puste, aby zadanie powtarzało się bez końca
                    </Text>
                  </View>
                )}

                {/* Info box */}
                {isRecurring && (
                  <View style={styles.infoBox}>
                    <Ionicons name="information-circle-outline" size={18} color="#6B7280" />
                    <Text style={styles.infoText}>
                      Zadania powtarzalne będą automatycznie pojawiać się w kalendarzu zgodnie z
                      wybranym harmonogramem.
                    </Text>
                  </View>
                )}
              </>
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
            <TouchableOpacity
              data-testid="detail-modal-close"
              onPress={() => setShowDetailModal(false)}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Notatka</Text>
            <TouchableOpacity
              data-testid="detail-modal-delete"
              onPress={() => selectedNote && deleteNote(selectedNote.id)}
            >
              <Ionicons name="trash-outline" size={24} color="#EF4444" />
            </TouchableOpacity>
          </View>

          {selectedNote && (
            <ScrollView style={styles.detailContent}>
              <View style={styles.detailHeader}>
                <View
                  style={[
                    styles.categoryBadge,
                    { backgroundColor: getCategoryInfo(selectedNote.category).color + '20' },
                  ]}
                >
                  <Ionicons
                    name={getCategoryInfo(selectedNote.category).icon as any}
                    size={14}
                    color={getCategoryInfo(selectedNote.category).color}
                  />
                  <Text
                    style={[
                      styles.categoryText,
                      { color: getCategoryInfo(selectedNote.category).color },
                    ]}
                  >
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

              {/* Voice playback in detail */}
              {selectedNote.voice_base64 && (
                <TouchableOpacity
                  data-testid="detail-play-voice"
                  style={styles.detailVoicePlayer}
                  onPress={() => playVoice(selectedNote.voice_base64!, selectedNote.id)}
                >
                  <Ionicons
                    name={playingNoteId === selectedNote.id ? 'pause-circle' : 'play-circle'}
                    size={40}
                    color="#22C55E"
                  />
                  <Text style={styles.detailVoiceText}>
                    {playingNoteId === selectedNote.id ? 'Odtwarzanie...' : 'Odtwórz nagranie'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Image display in detail */}
              {selectedNote.image_base64 && (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${selectedNote.image_base64}` }}
                  style={styles.detailImage}
                  resizeMode="contain"
                />
              )}

              {/* Advanced scheduling details */}
              {selectedNote.category === 'zadania' && (
                <View style={styles.detailScheduleSection}>
                  {selectedNote.scheduled_time && (
                    <View style={styles.detailScheduleRow}>
                      <Ionicons name="time-outline" size={16} color="#3B82F6" />
                      <Text style={styles.detailScheduleLabel}>Godzina:</Text>
                      <Text style={styles.detailScheduleValue}>{selectedNote.scheduled_time}</Text>
                    </View>
                  )}
                  {selectedNote.scheduled_date && (
                    <View style={styles.detailScheduleRow}>
                      <Ionicons name="calendar-outline" size={16} color="#3B82F6" />
                      <Text style={styles.detailScheduleLabel}>Data:</Text>
                      <Text style={styles.detailScheduleValue}>{selectedNote.scheduled_date}</Text>
                    </View>
                  )}
                  {selectedNote.is_recurring && selectedNote.recurrence_pattern === 'custom' && selectedNote.recurrence_days?.length > 0 && (
                    <View style={styles.detailScheduleRow}>
                      <Ionicons name="calendar-number-outline" size={16} color="#8B5CF6" />
                      <Text style={styles.detailScheduleLabel}>Dni:</Text>
                      <Text style={styles.detailScheduleValue}>
                        {getDaysLabel(selectedNote.recurrence_days)}
                      </Text>
                    </View>
                  )}
                  {selectedNote.recurrence_end_date && (
                    <View style={styles.detailScheduleRow}>
                      <Ionicons name="flag-outline" size={16} color="#EF4444" />
                      <Text style={styles.detailScheduleLabel}>Koniec:</Text>
                      <Text style={styles.detailScheduleValue}>
                        {selectedNote.recurrence_end_date}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {selectedNote.category === 'zadania' && (
                <TouchableOpacity
                  data-testid="detail-toggle-complete"
                  style={[
                    styles.completeButton,
                    selectedNote.is_completed && styles.completeButtonDone,
                  ]}
                  onPress={() => {
                    toggleComplete(selectedNote.id, selectedNote.is_completed);
                    setSelectedNote({
                      ...selectedNote,
                      is_completed: !selectedNote.is_completed,
                    });
                  }}
                >
                  <Ionicons
                    name={selectedNote.is_completed ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={selectedNote.is_completed ? '#22C55E' : '#F59E0B'}
                  />
                  <Text
                    style={[
                      styles.completeButtonText,
                      selectedNote.is_completed && styles.completeButtonTextDone,
                    ]}
                  >
                    {selectedNote.is_completed ? 'Wykonane' : 'Oznacz jako wykonane'}
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
    flexWrap: 'wrap',
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
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E3A5F',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 3,
  },
  timeText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '600',
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
  recurrenceInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
    flexWrap: 'wrap',
  },
  recurrenceInfo: {
    color: '#8B5CF6',
    fontSize: 12,
  },
  recurrenceEndInfo: {
    color: '#9CA3AF',
    fontSize: 11,
    marginLeft: 4,
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
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 0,
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
  helperText: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 6,
    marginLeft: 4,
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
  daysRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#374151',
  },
  dayChipActive: {
    backgroundColor: '#8B5CF620',
    borderColor: '#8B5CF6',
  },
  dayChipText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  dayChipTextActive: {
    color: '#8B5CF6',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 20,
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
  detailScheduleSection: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
    gap: 10,
  },
  detailScheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailScheduleLabel: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  detailScheduleValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
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
  mediaIndicators: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  mediaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  mediaChipText: {
    color: '#4ADE80',
    fontSize: 11,
    fontWeight: '500',
  },
  mediaButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mediaButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    gap: 4,
  },
  mediaButtonActive: {
    borderColor: '#EF4444',
    backgroundColor: '#EF444410',
  },
  mediaButtonText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '500',
  },
  mediaPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#374151',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    gap: 8,
  },
  mediaPreviewText: {
    flex: 1,
    color: '#D1D5DB',
    fontSize: 13,
  },
  imagePreviewThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  detailVoicePlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    gap: 12,
  },
  detailVoiceText: {
    color: '#4ADE80',
    fontSize: 15,
    fontWeight: '500',
  },
  detailImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginTop: 16,
  },
});
