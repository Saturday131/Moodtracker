import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './auth-context';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const QUICK_QUESTIONS = [
  "Jak mi idzie w tym tygodniu?",
  "Podsumuj mój dzień",
  "Dodaj codzienne zadanie: wyprowadź psa",
  "Jakie mam zadania na dziś?",
];

export default function ChatScreen() {
  const { authHeaders } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showQuickQuestions, setShowQuickQuestions] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadSession();
  }, []);

  const loadSession = async () => {
    try {
      const storedSessionId = await AsyncStorage.getItem('chat_session_id');
      if (storedSessionId) {
        setSessionId(storedSessionId);
        const response = await fetch(`${API_URL}/api/chat/history/${storedSessionId}`);
        if (response.ok) {
          const history = await response.json();
          if (history.length > 0) {
            setMessages(history);
            setShowQuickQuestions(false);
          }
        }
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setLoading(true);
    setShowQuickQuestions(false);
    Keyboard.dismiss();

    const lowerText = text.toLowerCase();
    const isTaskRelated = 
      lowerText.includes('zadani') || 
      lowerText.includes('dodaj') ||
      lowerText.includes('utwórz') ||
      lowerText.includes('przesuń') ||
      lowerText.includes('zmień') ||
      lowerText.includes('usuń') ||
      lowerText.includes('harmonogram') ||
      lowerText.includes('codzien') ||
      lowerText.includes('powtarz');

    try {
      let response;
      let assistantContent = '';

      if (isTaskRelated) {
        // Use task modification endpoint
        response = await fetch(`${API_URL}/api/tasks/chat-modify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_message: text.trim(),
            session_id: sessionId,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            assistantContent = data.ai_response || 'Zadania zostały zaktualizowane.';
            if (data.operations_executed && data.operations_executed.length > 0) {
              assistantContent += '\n\n✅ Wykonane operacje:\n' + data.operations_executed.map((op: string) => `• ${op}`).join('\n');
            }
          } else {
            assistantContent = data.error || 'Przepraszam, nie udało się zmodyfikować zadań.';
          }
        }
      } else {
        // Use regular chat endpoint
        response = await fetch(`${API_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text.trim(),
            session_id: sessionId,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          
          if (data.session_id && data.session_id !== sessionId) {
            setSessionId(data.session_id);
            await AsyncStorage.setItem('chat_session_id', data.session_id);
          }

          assistantContent = data.message;
        }
      }

      if (response && response.ok) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: assistantContent,
          timestamp: new Date().toISOString(),
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else if (response) {
        const error = await response.json();
        Alert.alert('Błąd', error.detail || 'Nie udało się uzyskać odpowiedzi');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Błąd', 'Nie udało się połączyć z asystentem');
    } finally {
      setLoading(false);
    }
  };

  const clearChat = async () => {
    Alert.alert(
      'Wyczyścić czat?',
      'Spowoduje to usunięcie historii rozmowy.',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Wyczyść',
          style: 'destructive',
          onPress: async () => {
            if (sessionId) {
              try {
                await fetch(`${API_URL}/api/chat/history/${sessionId}`, {
                  method: 'DELETE',
                });
              } catch (error) {
                console.error('Error clearing history:', error);
              }
            }
            setMessages([]);
            setShowQuickQuestions(true);
            const newSessionId = Date.now().toString();
            setSessionId(newSessionId);
            await AsyncStorage.setItem('chat_session_id', newSessionId);
          },
        },
      ]
    );
  };

  const getWeeklySummary = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/weekly-summary`);
      if (response.ok) {
        const data = await response.json();
        const summaryMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: data.summary,
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, summaryMessage]);
        setShowQuickQuestions(false);
      }
    } catch (error) {
      Alert.alert('Błąd', 'Nie udało się pobrać podsumowania tygodniowego');
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = (message: Message) => {
    const isUser = message.role === 'user';
    
    return (
      <View
        key={message.id}
        style={[
          styles.messageContainer,
          isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
        ]}
      >
        {!isUser && (
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarEmoji}>🤖</Text>
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header Actions */}
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.summaryButton} onPress={getWeeklySummary}>
            <Ionicons name="sparkles" size={18} color="#F59E0B" />
            <Text style={styles.summaryButtonText}>Podsumowanie Tygodnia</Text>
          </TouchableOpacity>
          {messages.length > 0 && (
            <TouchableOpacity style={styles.clearButton} onPress={clearChat}>
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 && (
            <View style={styles.welcomeContainer}>
              <Text style={styles.welcomeEmoji}>🤖</Text>
              <Text style={styles.welcomeTitle}>Asystent Nastroju</Text>
              <Text style={styles.welcomeText}>
                Cześć! Jestem Twoim asystentem nastroju. Mogę pomóc Ci zrozumieć
                wzorce nastrojów, identyfikować trendy i dawać spostrzeżenia
                na podstawie Twoich danych.
              </Text>
              <Text style={styles.welcomeSubtext}>
                Zapytaj mnie o cokolwiek dotyczącego Twojego nastroju!
              </Text>
            </View>
          )}

          {messages.map(renderMessage)}

          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#6366F1" />
              <Text style={styles.loadingText}>Myślę...</Text>
            </View>
          )}
        </ScrollView>

        {/* Quick Questions */}
        {showQuickQuestions && !loading && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickQuestionsScroll}
            contentContainerStyle={styles.quickQuestionsContainer}
          >
            {QUICK_QUESTIONS.map((question, index) => (
              <TouchableOpacity
                key={index}
                style={styles.quickQuestionButton}
                onPress={() => sendMessage(question)}
              >
                <Text style={styles.quickQuestionText}>{question}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Zapytaj o swój nastrój..."
            placeholderTextColor="#6B7280"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || loading}
          >
            <Ionicons
              name="send"
              size={22}
              color={inputText.trim() && !loading ? '#FFFFFF' : '#6B7280'}
            />
          </TouchableOpacity>
        </View>
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
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  summaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  summaryButtonText: {
    color: '#F59E0B',
    fontSize: 13,
    fontWeight: '600',
  },
  clearButton: {
    padding: 8,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 8,
  },
  welcomeContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  welcomeEmoji: {
    fontSize: 60,
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  welcomeText: {
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  welcomeSubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  assistantMessageContainer: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarEmoji: {
    fontSize: 20,
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 16,
    padding: 12,
  },
  userBubble: {
    backgroundColor: '#6366F1',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#1F2937',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: '#E5E7EB',
    lineHeight: 22,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 44,
    gap: 8,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  quickQuestionsScroll: {
    maxHeight: 50,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
  },
  quickQuestionsContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  quickQuestionButton: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
  },
  quickQuestionText: {
    color: '#D1D5DB',
    fontSize: 13,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#1F2937',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1F2937',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingRight: 12,
    color: '#FFFFFF',
    fontSize: 15,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#374151',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#374151',
  },
});
