import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Image,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons'
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as Device from 'expo-device';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Notifications will be handled on the backend - Expo Go doesn't support push notifications
// In production builds, you would add expo-notifications here

interface Note {
  id: string;
  title: string | null;
  text_content: string | null;
  voice_base64: string | null;
  voice_transcription: string | null;
  image_base64: string | null;
  tags: string[];
  reminder_date: string | null;
  ai_summary: string | null;
  ai_keywords: string[];
  ai_suggested_reminder: string | null;
  reminder_sent: boolean;
  created_at: string;
}

interface NotesLibrary {
  total: number;
  notes: Note[];
  all_tags: string[];
  period: string;
}

type ViewMode = 'list' | 'library';
type LibraryPeriod = 'all' | 'week' | 'month' | 'year';

export default function NotesScreen() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [libraryPeriod, setLibraryPeriod] = useState<LibraryPeriod>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [summaryContent, setSummaryContent] = useState('');
  const [summaryType, setSummaryType] = useState<'daily' | 'weekly'>('daily');
  
  // Create note state
  const [title, setTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [tags, setTags] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [voiceBase64, setVoiceBase64] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [saving, setSaving] = useState(false);
  const [playingSound, setPlayingSound] = useState<Audio.Sound | null>(null);

  useEffect(() => {
    fetchNotes();
    checkPendingReminders();

    return () => {
      if (playingSound) {
        playingSound.unloadAsync();
      }
    };
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [libraryPeriod, selectedTag, searchQuery]);

  const registerForPushNotifications = async () => {
    if (!Device.isDevice) {
      return;
    }
    
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
    }
  };

  const scheduleReminderNotification = async (note: Note) => {
    if (!note.reminder_date) return;
    
    const reminderDate = new Date(note.reminder_date);
    reminderDate.setHours(9, 0, 0, 0); // Set to 9 AM
    
    if (reminderDate <= new Date()) {
      // Send immediate notification for past reminders
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `📝 Reminder: ${note.title || 'Note'}`,
          body: note.ai_summary || note.text_content?.slice(0, 100) || 'You have a reminder',
          data: { noteId: note.id },
        },
        trigger: null,
      });
    } else {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `📝 Reminder: ${note.title || 'Note'}`,
          body: note.ai_summary || note.text_content?.slice(0, 100) || 'You have a reminder',
          data: { noteId: note.id },
        },
        trigger: { date: reminderDate },
      });
    }
  };

  const scheduleDailySummaryNotification = async () => {
    const trigger = new Date();
    trigger.setHours(21, 0, 0, 0); // 9 PM
    if (trigger <= new Date()) {
      trigger.setDate(trigger.getDate() + 1);
    }
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📊 Daily Summary Ready',
        body: 'Tap to view your mood and notes summary for today',
        data: { type: 'daily_summary' },
      },
      trigger: { date: trigger, repeats: true },
    });
  };

  const scheduleWeeklySummaryNotification = async () => {
    // Schedule for Sunday 9 PM
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📊 Weekly Summary Ready',
        body: 'Tap to view your weekly mood trends and notes',
        data: { type: 'weekly_summary' },
      },
      trigger: { weekday: 1, hour: 9, minute: 0, repeats: true },
    });
  };

  const openNoteFromNotification = async (noteId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/notes/${noteId}`);
      if (response.ok) {
        const note = await response.json();
        setSelectedNote(note);
        setShowDetailModal(true);
      }
    } catch (error) {
      console.error('Error opening note:', error);
    }
  };

  const checkPendingReminders = async () => {
    try {
      const response = await fetch(`${API_URL}/api/notes/reminders/pending`);
      if (response.ok) {
        const pendingNotes = await response.json();
        for (const note of pendingNotes) {
          if (!note.reminder_sent) {
            await scheduleReminderNotification(note);
            // Mark as sent
            await fetch(`${API_URL}/api/notes/reminders/${note.id}/mark-sent`, { method: 'PUT' });
          }
        }
      }
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  };

  const fetchNotes = async () => {
    try {
      if (!refreshing) setLoading(true);
      
      let url = `${API_URL}/api/notes/library?period=${libraryPeriod}`;
      if (selectedTag) url += `&tag=${encodeURIComponent(selectedTag)}`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data: NotesLibrary = await response.json();
        
        // Apply search filter client-side
        let filteredNotes = data.notes;
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          filteredNotes = data.notes.filter(note =>
            note.title?.toLowerCase().includes(query) ||
            note.text_content?.toLowerCase().includes(query) ||
            note.voice_transcription?.toLowerCase().includes(query) ||
            note.ai_summary?.toLowerCase().includes(query) ||
            note.ai_keywords.some(k => k.toLowerCase().includes(query))
          );
        }
        
        setNotes(filteredNotes);
        setAllTags(data.all_tags);
      }
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNotes();
    checkPendingReminders();
  }, [libraryPeriod, selectedTag]);

  const fetchSummary = async (type: 'daily' | 'weekly') => {
    setSummaryType(type);
    setSummaryContent('Loading...');
    setShowSummaryModal(true);
    
    try {
      const endpoint = type === 'daily' ? 'daily-summary' : 'weekly-summary';
      const response = await fetch(`${API_URL}/api/${endpoint}`);
      if (response.ok) {
        const data = await response.json();
        setSummaryContent(data.summary);
      } else {
        setSummaryContent('Failed to load summary');
      }
    } catch (error) {
      setSummaryContent('Error loading summary');
    }
  };

  const requestPermissions = async () => {
    const { status: audioStatus } = await Audio.requestPermissionsAsync();
    const { status: imageStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return audioStatus === 'granted' && imageStatus === 'granted';
  };

  const startRecording = async () => {
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        Alert.alert('Wymagane Uprawnienia', 'Proszę nadać uprawnienia do nagrywania dźwięku');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert('Błąd', 'Nie udało się rozpocząć nagrywania');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      if (uri) {
        const response = await fetch(uri);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          setVoiceBase64(base64.split(',')[1]);
        };
        reader.readAsDataURL(blob);
      }
      
      setRecording(null);
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  };

  const pickImage = async () => {
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        Alert.alert('Wymagane Uprawnienia', 'Proszę nadać uprawnienia do biblioteki zdjęć');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setImageBase64(result.assets[0].base64);
      }
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się wybrać zdjęcia');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Wymagane Uprawnienia', 'Proszę nadać uprawnienia do aparatu');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setImageBase64(result.assets[0].base64);
      }
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się zrobić zdjęcia');
    }
  };

  const saveNote = async () => {
    if (!title.trim() && !textContent.trim() && !voiceBase64 && !imageBase64) {
      Alert.alert('Pusta Notatka', 'Proszę dodać treść do notatki');
      return;
    }

    setSaving(true);
    try {
      const noteData = {
        title: title.trim() || null,
        text_content: textContent.trim() || null,
        voice_base64: voiceBase64,
        image_base64: imageBase64,
        tags: tags.split(',').map(t => t.trim()).filter(t => t),
      };

      const response = await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noteData),
      });

      if (response.ok) {
        const newNote = await response.json();
        
        // Schedule notification if AI suggested a reminder
        if (newNote.ai_suggested_reminder) {
          Alert.alert(
            'Smart Reminder Detected',
            `Based on your note, I suggest a reminder for ${newNote.ai_suggested_reminder}. Would you like to set it?`,
            [
              { text: 'No Thanks', style: 'cancel' },
              {
                text: 'Set Reminder',
                onPress: async () => {
                  await scheduleReminderNotification(newNote);
                  Alert.alert('Reminder Set!', 'You\'ll be notified on the scheduled date');
                },
              },
            ]
          );
        } else {
          Alert.alert('Saved!', 'Your note has been saved and analyzed');
        }
        
        resetForm();
        setShowCreateModal(false);
        fetchNotes();
      } else {
        Alert.alert('Error', 'Failed to save note');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    Alert.alert('Delete Note?', 'This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${API_URL}/api/notes/${noteId}`, { method: 'DELETE' });
            fetchNotes();
            setShowDetailModal(false);
          } catch (error) {
            Alert.alert('Error', 'Failed to delete note');
          }
        },
      },
    ]);
  };

  const acceptSuggestedReminder = async (note: Note) => {
    try {
      const response = await fetch(`${API_URL}/api/notes/${note.id}/reminder?accept_suggestion=true`, {
        method: 'PUT',
      });
      if (response.ok) {
        const updatedNote = await response.json();
        await scheduleReminderNotification(updatedNote);
        Alert.alert('Reminder Set!', `You'll be reminded on ${updatedNote.reminder_date}`);
        fetchNotes();
        setSelectedNote(updatedNote);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to set reminder');
    }
  };

  const resetForm = () => {
    setTitle('');
    setTextContent('');
    setTags('');
    setImageBase64(null);
    setVoiceBase64(null);
  };

  const playVoiceNote = async (base64: string) => {
    try {
      if (playingSound) {
        await playingSound.unloadAsync();
      }
      const { sound } = await Audio.Sound.createAsync({ uri: `data:audio/m4a;base64,${base64}` });
      setPlayingSound(sound);
      await sound.playAsync();
    } catch (error) {
      console.error('Error playing voice note:', error);
    }
  };

  const renderNoteCard = (note: Note) => {
    const hasVoice = !!note.voice_base64;
    const hasImage = !!note.image_base64;
    const hasReminder = !!note.reminder_date;
    const hasTranscription = !!note.voice_transcription;

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
          <Text style={styles.noteTitle} numberOfLines={1}>
            {note.title || 'Untitled Note'}
          </Text>
          <Text style={styles.noteDate}>
            {format(new Date(note.created_at), 'MMM d')}
          </Text>
        </View>

        {note.ai_summary && (
          <Text style={styles.noteSummary} numberOfLines={2}>
            {note.ai_summary}
          </Text>
        )}

        {hasTranscription && !note.ai_summary && (
          <View style={styles.transcriptionPreview}>
            <Ionicons name="mic" size={12} color="#8B5CF6" />
            <Text style={styles.transcriptionText} numberOfLines={1}>
              {note.voice_transcription}
            </Text>
          </View>
        )}

        {note.text_content && !note.ai_summary && !hasTranscription && (
          <Text style={styles.noteContent} numberOfLines={2}>
            {note.text_content}
          </Text>
        )}

        <View style={styles.noteFooter}>
          <View style={styles.noteIcons}>
            {hasVoice && <Ionicons name="mic" size={16} color="#8B5CF6" />}
            {hasImage && <Ionicons name="image" size={16} color="#22C55E" />}
            {hasReminder && (
              <View style={styles.reminderBadge}>
                <Ionicons name="alarm" size={14} color="#F59E0B" />
              </View>
            )}
          </View>
          {note.ai_keywords.length > 0 && (
            <View style={styles.keywordsContainer}>
              {note.ai_keywords.slice(0, 2).map((keyword, index) => (
                <Text key={index} style={styles.keyword}>{keyword}</Text>
              ))}
            </View>
          )}
        </View>

        {note.ai_suggested_reminder && !note.reminder_date && (
          <TouchableOpacity
            style={styles.suggestedReminderBanner}
            onPress={() => acceptSuggestedReminder(note)}
          >
            <Ionicons name="sparkles" size={14} color="#F59E0B" />
            <Text style={styles.suggestedReminderText}>
              AI suggests reminder: {note.ai_suggested_reminder}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading notes...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header Actions */}
      <View style={styles.headerBar}>
        <View style={styles.summaryButtons}>
          <TouchableOpacity style={styles.summaryBtn} onPress={() => fetchSummary('daily')}>
            <Ionicons name="today" size={16} color="#6366F1" />
            <Text style={styles.summaryBtnText}>Daily</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.summaryBtn} onPress={() => fetchSummary('weekly')}>
            <Ionicons name="calendar" size={16} color="#6366F1" />
            <Text style={styles.summaryBtnText}>Weekly</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search notes..."
          placeholderTextColor="#6B7280"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#6B7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* Period Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        <View style={styles.filterContainer}>
          {(['all', 'week', 'month', 'year'] as LibraryPeriod[]).map((period) => (
            <TouchableOpacity
              key={period}
              style={[styles.filterBtn, libraryPeriod === period && styles.filterBtnActive]}
              onPress={() => setLibraryPeriod(period)}
            >
              <Text style={[styles.filterBtnText, libraryPeriod === period && styles.filterBtnTextActive]}>
                {period === 'all' ? 'All Time' : period.charAt(0).toUpperCase() + period.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Tags Filter */}
      {allTags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsFilterScroll}>
          <View style={styles.tagsFilterContainer}>
            <TouchableOpacity
              style={[styles.tagFilter, !selectedTag && styles.tagFilterActive]}
              onPress={() => setSelectedTag(null)}
            >
              <Text style={[styles.tagFilterText, !selectedTag && styles.tagFilterTextActive]}>All</Text>
            </TouchableOpacity>
            {allTags.slice(0, 10).map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[styles.tagFilter, selectedTag === tag && styles.tagFilterActive]}
                onPress={() => setSelectedTag(selectedTag === tag ? null : tag)}
              >
                <Text style={[styles.tagFilterText, selectedTag === tag && styles.tagFilterTextActive]}>
                  {tag}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Notes List */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
        contentContainerStyle={styles.listContent}
      >
        {/* Stats Card */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{notes.length}</Text>
            <Text style={styles.statLabel}>Notes</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{notes.filter(n => n.reminder_date).length}</Text>
            <Text style={styles.statLabel}>Reminders</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{notes.filter(n => n.voice_base64).length}</Text>
            <Text style={styles.statLabel}>Voice</Text>
          </View>
        </View>

        {notes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={60} color="#4B5563" />
            <Text style={styles.emptyTitle}>No Notes Found</Text>
            <Text style={styles.emptyText}>
              {searchQuery || selectedTag ? 'Try different filters' : 'Create your first note'}
            </Text>
          </View>
        ) : (
          <View style={styles.notesGrid}>
            {notes.map(renderNoteCard)}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowCreateModal(true)}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Create Note Modal */}
      <Modal visible={showCreateModal} animationType="slide" onRequestClose={() => setShowCreateModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => { resetForm(); setShowCreateModal(false); }}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Note</Text>
            <TouchableOpacity onPress={saveNote} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color="#6366F1" /> : <Text style={styles.saveButton}>Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <TextInput
              style={styles.titleInput}
              placeholder="Title (optional)"
              placeholderTextColor="#6B7280"
              value={title}
              onChangeText={setTitle}
            />

            <TextInput
              style={styles.contentInput}
              placeholder="Write your thoughts..."
              placeholderTextColor="#6B7280"
              value={textContent}
              onChangeText={setTextContent}
              multiline
              textAlignVertical="top"
            />

            {/* Voice Recording Info */}
            {voiceBase64 && (
              <View style={styles.infoCard}>
                <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                <Text style={styles.infoText}>Voice note recorded - AI will transcribe and analyze it</Text>
              </View>
            )}

            {/* Media Buttons */}
            <View style={styles.mediaSection}>
              <Text style={styles.sectionTitle}>Attachments</Text>
              <View style={styles.mediaButtons}>
                <TouchableOpacity
                  style={[styles.mediaButton, isRecording && styles.recordingButton]}
                  onPress={isRecording ? stopRecording : startRecording}
                >
                  <Ionicons name={isRecording ? "stop" : "mic"} size={24} color={isRecording ? "#EF4444" : "#8B5CF6"} />
                  <Text style={styles.mediaButtonText}>{isRecording ? 'Stop' : voiceBase64 ? 'Re-record' : 'Voice'}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.mediaButton} onPress={pickImage}>
                  <Ionicons name="images" size={24} color="#22C55E" />
                  <Text style={styles.mediaButtonText}>Gallery</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.mediaButton} onPress={takePhoto}>
                  <Ionicons name="camera" size={24} color="#F59E0B" />
                  <Text style={styles.mediaButtonText}>Camera</Text>
                </TouchableOpacity>
              </View>

              {imageBase64 && (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: `data:image/jpeg;base64,${imageBase64}` }} style={styles.imagePreview} />
                  <TouchableOpacity style={styles.removeImageButton} onPress={() => setImageBase64(null)}>
                    <Ionicons name="close-circle" size={24} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Tags */}
            <View style={styles.tagsSection}>
              <Text style={styles.sectionTitle}>Tags (comma separated)</Text>
              <TextInput
                style={styles.tagsInput}
                placeholder="work, ideas, important..."
                placeholderTextColor="#6B7280"
                value={tags}
                onChangeText={setTags}
              />
            </View>

            {/* Smart Reminder Info */}
            <View style={styles.aiInfoCard}>
              <Ionicons name="sparkles" size={18} color="#F59E0B" />
              <Text style={styles.aiInfoText}>
                AI will analyze your note and suggest reminders based on deadlines, goals, or important dates mentioned.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Note Detail Modal */}
      <Modal visible={showDetailModal} animationType="slide" onRequestClose={() => setShowDetailModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDetailModal(false)}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Note Details</Text>
            <TouchableOpacity onPress={() => selectedNote && deleteNote(selectedNote.id)}>
              <Ionicons name="trash-outline" size={24} color="#EF4444" />
            </TouchableOpacity>
          </View>

          {selectedNote && (
            <ScrollView style={styles.modalContent}>
              <Text style={styles.detailTitle}>{selectedNote.title || 'Untitled Note'}</Text>
              <Text style={styles.detailDate}>
                {format(new Date(selectedNote.created_at), 'EEEE, MMMM d, yyyy h:mm a')}
              </Text>

              {selectedNote.ai_summary && (
                <View style={styles.aiSummaryCard}>
                  <View style={styles.aiHeader}>
                    <Ionicons name="sparkles" size={18} color="#F59E0B" />
                    <Text style={styles.aiLabel}>AI Summary</Text>
                  </View>
                  <Text style={styles.aiSummaryText}>{selectedNote.ai_summary}</Text>
                </View>
              )}

              {selectedNote.voice_transcription && (
                <View style={styles.transcriptionCard}>
                  <View style={styles.aiHeader}>
                    <Ionicons name="mic" size={18} color="#8B5CF6" />
                    <Text style={styles.transcriptionLabel}>Voice Transcription</Text>
                  </View>
                  <Text style={styles.transcriptionFullText}>{selectedNote.voice_transcription}</Text>
                </View>
              )}

              {selectedNote.text_content && (
                <View style={styles.contentSection}>
                  <Text style={styles.contentLabel}>Content</Text>
                  <Text style={styles.detailContent}>{selectedNote.text_content}</Text>
                </View>
              )}

              {selectedNote.voice_base64 && (
                <TouchableOpacity style={styles.playVoiceButton} onPress={() => playVoiceNote(selectedNote.voice_base64!)}>
                  <Ionicons name="play-circle" size={32} color="#8B5CF6" />
                  <Text style={styles.playVoiceText}>Play Voice Note</Text>
                </TouchableOpacity>
              )}

              {selectedNote.image_base64 && (
                <Image
                  source={{ uri: `data:image/jpeg;base64,${selectedNote.image_base64}` }}
                  style={styles.detailImage}
                  resizeMode="contain"
                />
              )}

              {selectedNote.ai_keywords.length > 0 && (
                <View style={styles.keywordsSection}>
                  <Text style={styles.contentLabel}>AI Keywords</Text>
                  <View style={styles.keywordsList}>
                    {selectedNote.ai_keywords.map((keyword, index) => (
                      <View key={index} style={styles.keywordTag}>
                        <Text style={styles.keywordTagText}>{keyword}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {selectedNote.ai_suggested_reminder && !selectedNote.reminder_date && (
                <TouchableOpacity style={styles.acceptReminderBtn} onPress={() => acceptSuggestedReminder(selectedNote)}>
                  <Ionicons name="alarm" size={20} color="#FFFFFF" />
                  <Text style={styles.acceptReminderText}>
                    Set AI Suggested Reminder: {selectedNote.ai_suggested_reminder}
                  </Text>
                </TouchableOpacity>
              )}

              {selectedNote.reminder_date && (
                <View style={styles.reminderDisplay}>
                  <Ionicons name="alarm" size={20} color="#F59E0B" />
                  <Text style={styles.reminderText}>Reminder: {selectedNote.reminder_date}</Text>
                </View>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Summary Modal */}
      <Modal visible={showSummaryModal} animationType="fade" transparent onRequestClose={() => setShowSummaryModal(false)}>
        <View style={styles.summaryModalOverlay}>
          <View style={styles.summaryModalContent}>
            <View style={styles.summaryModalHeader}>
              <Text style={styles.summaryModalTitle}>
                {summaryType === 'daily' ? '📊 Daily Summary' : '📊 Weekly Summary'}
              </Text>
              <TouchableOpacity onPress={() => setShowSummaryModal(false)}>
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.summaryScrollView}>
              <Text style={styles.summaryText}>{summaryContent}</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  loadingContainer: { flex: 1, backgroundColor: '#111827', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#9CA3AF', marginTop: 10, fontSize: 16 },
  headerBar: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  summaryButtons: { flexDirection: 'row', gap: 12 },
  summaryBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 6 },
  summaryBtnText: { color: '#6366F1', fontSize: 13, fontWeight: '600' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 15, marginLeft: 10 },
  filterScroll: { maxHeight: 44, marginBottom: 4 },
  filterContainer: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#1F2937', borderRadius: 20 },
  filterBtnActive: { backgroundColor: '#6366F1' },
  filterBtnText: { color: '#9CA3AF', fontSize: 13, fontWeight: '500' },
  filterBtnTextActive: { color: '#FFFFFF' },
  tagsFilterScroll: { maxHeight: 40, marginBottom: 8 },
  tagsFilterContainer: { flexDirection: 'row', paddingHorizontal: 16, gap: 6 },
  tagFilter: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#374151', borderRadius: 16 },
  tagFilterActive: { backgroundColor: '#4C1D95' },
  tagFilterText: { color: '#9CA3AF', fontSize: 12 },
  tagFilterTextActive: { color: '#A78BFA' },
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },
  statsCard: { flexDirection: 'row', backgroundColor: '#1F2937', borderRadius: 12, padding: 16, marginBottom: 16 },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: '#374151' },
  statValue: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF' },
  statLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF', marginTop: 16 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 8 },
  notesGrid: { gap: 12 },
  noteCard: { backgroundColor: '#1F2937', borderRadius: 12, padding: 14 },
  noteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  noteTitle: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', flex: 1 },
  noteDate: { fontSize: 11, color: '#6B7280' },
  noteSummary: { fontSize: 13, color: '#D1D5DB', lineHeight: 18, fontStyle: 'italic' },
  transcriptionPreview: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  transcriptionText: { fontSize: 13, color: '#A78BFA', flex: 1 },
  noteContent: { fontSize: 13, color: '#9CA3AF', lineHeight: 18 },
  noteFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  noteIcons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  reminderBadge: { backgroundColor: '#78350F', padding: 4, borderRadius: 6 },
  keywordsContainer: { flexDirection: 'row', gap: 6 },
  keyword: { fontSize: 10, color: '#6366F1', backgroundColor: '#1E1B4B', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  suggestedReminderBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#78350F', marginTop: 10, padding: 10, borderRadius: 8, gap: 8 },
  suggestedReminderText: { color: '#FCD34D', fontSize: 12, flex: 1 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  modalContainer: { flex: 1, backgroundColor: '#111827' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  saveButton: { fontSize: 16, fontWeight: '600', color: '#6366F1' },
  modalContent: { flex: 1, padding: 16 },
  titleInput: { backgroundColor: '#1F2937', borderRadius: 12, padding: 16, color: '#FFFFFF', fontSize: 18, fontWeight: '600', marginBottom: 12 },
  contentInput: { backgroundColor: '#1F2937', borderRadius: 12, padding: 16, color: '#FFFFFF', fontSize: 15, minHeight: 100, marginBottom: 12 },
  infoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#14532D', borderRadius: 10, padding: 12, marginBottom: 12, gap: 10 },
  infoText: { color: '#86EFAC', fontSize: 13, flex: 1 },
  mediaSection: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', marginBottom: 10 },
  mediaButtons: { flexDirection: 'row', gap: 10 },
  mediaButton: { flex: 1, backgroundColor: '#1F2937', borderRadius: 12, padding: 14, alignItems: 'center' },
  recordingButton: { backgroundColor: '#7F1D1D' },
  mediaButtonText: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  imagePreviewContainer: { marginTop: 12, position: 'relative' },
  imagePreview: { width: '100%', height: 180, borderRadius: 12 },
  removeImageButton: { position: 'absolute', top: 8, right: 8 },
  tagsSection: { marginBottom: 16 },
  tagsInput: { backgroundColor: '#1F2937', borderRadius: 12, padding: 14, color: '#FFFFFF', fontSize: 14 },
  aiInfoCard: { flexDirection: 'row', backgroundColor: '#1E1B4B', borderRadius: 10, padding: 12, gap: 10, marginBottom: 20 },
  aiInfoText: { color: '#A5B4FC', fontSize: 12, flex: 1, lineHeight: 18 },
  detailTitle: { fontSize: 22, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 6 },
  detailDate: { fontSize: 13, color: '#6B7280', marginBottom: 16 },
  aiSummaryCard: { backgroundColor: '#1E1B4B', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#312E81' },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  aiLabel: { fontSize: 13, fontWeight: '600', color: '#F59E0B' },
  aiSummaryText: { fontSize: 14, color: '#D1D5DB', lineHeight: 20 },
  transcriptionCard: { backgroundColor: '#2E1065', borderRadius: 12, padding: 14, marginBottom: 16 },
  transcriptionLabel: { fontSize: 13, fontWeight: '600', color: '#A78BFA' },
  transcriptionFullText: { fontSize: 14, color: '#E9D5FF', lineHeight: 20 },
  contentSection: { marginBottom: 16 },
  contentLabel: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', marginBottom: 8 },
  detailContent: { fontSize: 15, color: '#E5E7EB', lineHeight: 22 },
  playVoiceButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', borderRadius: 12, padding: 14, marginBottom: 16, gap: 12 },
  playVoiceText: { fontSize: 15, color: '#8B5CF6', fontWeight: '600' },
  detailImage: { width: '100%', height: 250, borderRadius: 12, marginBottom: 16 },
  keywordsSection: { marginBottom: 16 },
  keywordsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  keywordTag: { backgroundColor: '#1E1B4B', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  keywordTagText: { fontSize: 12, color: '#A5B4FC' },
  acceptReminderBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F59E0B', borderRadius: 12, padding: 14, marginBottom: 16, gap: 10 },
  acceptReminderText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', flex: 1 },
  reminderDisplay: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', borderRadius: 12, padding: 14, gap: 10 },
  reminderText: { fontSize: 14, color: '#F59E0B' },
  summaryModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  summaryModalContent: { backgroundColor: '#1F2937', borderRadius: 16, width: '100%', maxHeight: '80%' },
  summaryModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#374151' },
  summaryModalTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  summaryScrollView: { padding: 16 },
  summaryText: { fontSize: 15, color: '#D1D5DB', lineHeight: 24 },
});
