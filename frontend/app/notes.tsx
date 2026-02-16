import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Note {
  id: string;
  title: string | null;
  text_content: string | null;
  voice_base64: string | null;
  image_base64: string | null;
  tags: string[];
  reminder_date: string | null;
  ai_summary: string | null;
  ai_keywords: string[];
  created_at: string;
}

export default function NotesScreen() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  
  // Create note state
  const [title, setTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [tags, setTags] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [voiceBase64, setVoiceBase64] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [saving, setSaving] = useState(false);
  const [playingSound, setPlayingSound] = useState<Audio.Sound | null>(null);

  useEffect(() => {
    fetchNotes();
    return () => {
      if (playingSound) {
        playingSound.unloadAsync();
      }
    };
  }, []);

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/notes?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setNotes(data);
      }
    } catch (error) {
      console.error('Error fetching notes:', error);
    } finally {
      setLoading(false);
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
        Alert.alert('Permission Required', 'Please grant audio recording permission');
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
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      if (uri) {
        // Convert to base64
        const response = await fetch(uri);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          setVoiceBase64(base64.split(',')[1]); // Remove data:audio/... prefix
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
        Alert.alert('Permission Required', 'Please grant photo library permission');
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
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera permission');
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
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const saveNote = async () => {
    if (!title.trim() && !textContent.trim() && !voiceBase64 && !imageBase64) {
      Alert.alert('Empty Note', 'Please add some content to your note');
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
        reminder_date: reminderDate || null,
      };

      const response = await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noteData),
      });

      if (response.ok) {
        Alert.alert('Saved!', 'Your note has been saved and analyzed by AI');
        resetForm();
        setShowCreateModal(false);
        fetchNotes();
      } else {
        Alert.alert('Error', 'Failed to save note');
      }
    } catch (error) {
      console.error('Error saving note:', error);
      Alert.alert('Error', 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    Alert.alert(
      'Delete Note?',
      'This action cannot be undone.',
      [
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
      ]
    );
  };

  const resetForm = () => {
    setTitle('');
    setTextContent('');
    setTags('');
    setReminderDate('');
    setImageBase64(null);
    setVoiceBase64(null);
  };

  const playVoiceNote = async (base64: string) => {
    try {
      if (playingSound) {
        await playingSound.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/m4a;base64,${base64}` }
      );
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

        {note.text_content && !note.ai_summary && (
          <Text style={styles.noteContent} numberOfLines={2}>
            {note.text_content}
          </Text>
        )}

        <View style={styles.noteFooter}>
          <View style={styles.noteIcons}>
            {hasVoice && <Ionicons name="mic" size={16} color="#8B5CF6" />}
            {hasImage && <Ionicons name="image" size={16} color="#22C55E" />}
            {hasReminder && <Ionicons name="alarm" size={16} color="#F59E0B" />}
          </View>
          {note.ai_keywords.length > 0 && (
            <View style={styles.keywordsContainer}>
              {note.ai_keywords.slice(0, 2).map((keyword, index) => (
                <Text key={index} style={styles.keyword}>
                  {keyword}
                </Text>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading notes...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header Stats */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{notes.length}</Text>
            <Text style={styles.statLabel}>Total Notes</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {notes.filter(n => n.reminder_date).length}
            </Text>
            <Text style={styles.statLabel}>Reminders</Text>
          </View>
        </View>

        {/* Notes List */}
        {notes.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={60} color="#4B5563" />
            <Text style={styles.emptyTitle}>No Notes Yet</Text>
            <Text style={styles.emptyText}>
              Create your first note with text, voice, or images
            </Text>
          </View>
        ) : (
          <View style={styles.notesGrid}>
            {notes.map(renderNoteCard)}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Create Note Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => {
              resetForm();
              setShowCreateModal(false);
            }}>
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Note</Text>
            <TouchableOpacity onPress={saveNote} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#6366F1" />
              ) : (
                <Text style={styles.saveButton}>Save</Text>
              )}
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

            {/* Media Attachments */}
            <View style={styles.mediaSection}>
              <Text style={styles.sectionTitle}>Attachments</Text>
              
              <View style={styles.mediaButtons}>
                <TouchableOpacity
                  style={[styles.mediaButton, isRecording && styles.recordingButton]}
                  onPress={isRecording ? stopRecording : startRecording}
                >
                  <Ionicons
                    name={isRecording ? "stop" : "mic"}
                    size={24}
                    color={isRecording ? "#EF4444" : "#8B5CF6"}
                  />
                  <Text style={styles.mediaButtonText}>
                    {isRecording ? 'Stop' : voiceBase64 ? 'Re-record' : 'Voice'}
                  </Text>
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

              {voiceBase64 && (
                <View style={styles.attachmentPreview}>
                  <Ionicons name="mic" size={20} color="#8B5CF6" />
                  <Text style={styles.attachmentText}>Voice recording attached</Text>
                  <TouchableOpacity onPress={() => setVoiceBase64(null)}>
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              )}

              {imageBase64 && (
                <View style={styles.imagePreviewContainer}>
                  <Image
                    source={{ uri: `data:image/jpeg;base64,${imageBase64}` }}
                    style={styles.imagePreview}
                  />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => setImageBase64(null)}
                  >
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

            {/* Reminder */}
            <View style={styles.reminderSection}>
              <Text style={styles.sectionTitle}>Reminder Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.reminderInput}
                placeholder="2025-07-20"
                placeholderTextColor="#6B7280"
                value={reminderDate}
                onChangeText={setReminderDate}
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Note Detail Modal */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        onRequestClose={() => setShowDetailModal(false)}
      >
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
              <Text style={styles.detailTitle}>
                {selectedNote.title || 'Untitled Note'}
              </Text>
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

              {selectedNote.text_content && (
                <View style={styles.contentSection}>
                  <Text style={styles.contentLabel}>Content</Text>
                  <Text style={styles.detailContent}>{selectedNote.text_content}</Text>
                </View>
              )}

              {selectedNote.voice_base64 && (
                <TouchableOpacity
                  style={styles.playVoiceButton}
                  onPress={() => playVoiceNote(selectedNote.voice_base64!)}
                >
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

              {selectedNote.tags.length > 0 && (
                <View style={styles.tagsDisplaySection}>
                  <Text style={styles.contentLabel}>Tags</Text>
                  <View style={styles.tagsList}>
                    {selectedNote.tags.map((tag, index) => (
                      <View key={index} style={styles.tag}>
                        <Text style={styles.tagText}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {selectedNote.reminder_date && (
                <View style={styles.reminderDisplay}>
                  <Ionicons name="alarm" size={20} color="#F59E0B" />
                  <Text style={styles.reminderText}>
                    Reminder: {selectedNote.reminder_date}
                  </Text>
                </View>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
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
    marginTop: 10,
    fontSize: 16,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#1F2937',
    margin: 16,
    borderRadius: 16,
    padding: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#374151',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
  notesGrid: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  noteCard: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  noteDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  noteSummary: {
    fontSize: 14,
    color: '#D1D5DB',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  noteContent: {
    fontSize: 14,
    color: '#9CA3AF',
    lineHeight: 20,
  },
  noteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  noteIcons: {
    flexDirection: 'row',
    gap: 8,
  },
  keywordsContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  keyword: {
    fontSize: 11,
    color: '#6366F1',
    backgroundColor: '#1E1B4B',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6366F1',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  titleInput: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  contentInput: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    color: '#FFFFFF',
    fontSize: 16,
    minHeight: 120,
    marginBottom: 16,
  },
  mediaSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
  },
  mediaButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  mediaButton: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  recordingButton: {
    backgroundColor: '#7F1D1D',
  },
  mediaButtonText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  attachmentText: {
    flex: 1,
    fontSize: 14,
    color: '#D1D5DB',
  },
  imagePreviewContainer: {
    marginTop: 12,
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  tagsSection: {
    marginBottom: 16,
  },
  tagsInput: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 15,
  },
  reminderSection: {
    marginBottom: 24,
  },
  reminderInput: {
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 15,
  },
  detailTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  detailDate: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },
  aiSummaryCard: {
    backgroundColor: '#1E1B4B',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#312E81',
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  aiLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
  },
  aiSummaryText: {
    fontSize: 15,
    color: '#D1D5DB',
    lineHeight: 22,
  },
  contentSection: {
    marginBottom: 20,
  },
  contentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 8,
  },
  detailContent: {
    fontSize: 16,
    color: '#E5E7EB',
    lineHeight: 24,
  },
  playVoiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  playVoiceText: {
    fontSize: 16,
    color: '#8B5CF6',
    fontWeight: '600',
  },
  detailImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginBottom: 20,
  },
  keywordsSection: {
    marginBottom: 20,
  },
  keywordsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  keywordTag: {
    backgroundColor: '#1E1B4B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  keywordTagText: {
    fontSize: 13,
    color: '#A5B4FC',
  },
  tagsDisplaySection: {
    marginBottom: 20,
  },
  tagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  tagText: {
    fontSize: 13,
    color: '#D1D5DB',
  },
  reminderDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  reminderText: {
    fontSize: 15,
    color: '#F59E0B',
  },
});
