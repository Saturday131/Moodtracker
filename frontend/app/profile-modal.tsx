import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './auth-context';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ProfileModal({ visible, onClose }: Props) {
  const { user, authHeaders, logout } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);

  useEffect(() => {
    if (user && visible) {
      setName(user.name);
      setEmail(user.email);
      setCurrentPassword('');
      setNewPassword('');
      setEditingField(null);
    }
  }, [user, visible]);

  const saveChanges = async () => {
    setSaving(true);
    try {
      const params = new URLSearchParams();
      if (name !== user?.name) params.set('name', name);
      if (email !== user?.email) params.set('email', email);
      if (newPassword) {
        params.set('current_password', currentPassword);
        params.set('new_password', newPassword);
      }

      const res = await fetch(`${API_URL}/api/auth/profile?${params.toString()}`, {
        method: 'PUT',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Błąd', data.detail || 'Nie udało się zapisać');
      } else {
        Alert.alert('Zapisano', 'Profil zaktualizowany');
        setEditingField(null);
        setCurrentPassword('');
        setNewPassword('');
      }
    } catch {
      Alert.alert('Błąd', 'Nie udało się połączyć z serwerem');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = name !== user?.name || email !== user?.email || newPassword.length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={s.title}>Profil</Text>
          <TouchableOpacity onPress={saveChanges} disabled={!hasChanges || saving}>
            {saving ? <ActivityIndicator size="small" color="#6366F1" /> :
              <Text style={[s.saveText, !hasChanges && { opacity: 0.4 }]}>Zapisz</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView style={s.content}>
          {/* Avatar */}
          <View style={s.avatarSection}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{user?.name?.charAt(0).toUpperCase() || '?'}</Text>
            </View>
            <Text style={s.userName}>{user?.name}</Text>
            <Text style={s.userEmail}>{user?.email}</Text>
          </View>

          {/* Name */}
          <View style={s.field}>
            <View style={s.fieldHeader}>
              <Ionicons name="person-outline" size={18} color="#9CA3AF" />
              <Text style={s.fieldLabel}>Imię</Text>
              <TouchableOpacity onPress={() => setEditingField(editingField === 'name' ? null : 'name')}>
                <Ionicons name="create-outline" size={18} color="#6366F1" />
              </TouchableOpacity>
            </View>
            {editingField === 'name' ? (
              <TextInput style={s.input} value={name} onChangeText={setName} autoFocus />
            ) : (
              <Text style={s.fieldValue}>{name}</Text>
            )}
          </View>

          {/* Email */}
          <View style={s.field}>
            <View style={s.fieldHeader}>
              <Ionicons name="mail-outline" size={18} color="#9CA3AF" />
              <Text style={s.fieldLabel}>Email</Text>
              <TouchableOpacity onPress={() => setEditingField(editingField === 'email' ? null : 'email')}>
                <Ionicons name="create-outline" size={18} color="#6366F1" />
              </TouchableOpacity>
            </View>
            {editingField === 'email' ? (
              <TextInput style={s.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            ) : (
              <Text style={s.fieldValue}>{email}</Text>
            )}
          </View>

          {/* Password */}
          <View style={s.field}>
            <View style={s.fieldHeader}>
              <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
              <Text style={s.fieldLabel}>Hasło</Text>
              <TouchableOpacity onPress={() => setEditingField(editingField === 'password' ? null : 'password')}>
                <Ionicons name="create-outline" size={18} color="#6366F1" />
              </TouchableOpacity>
            </View>
            {editingField === 'password' ? (
              <View style={{ gap: 10, marginTop: 8 }}>
                <TextInput style={s.input} placeholder="Aktualne hasło" placeholderTextColor="#6B7280"
                  value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
                <TextInput style={s.input} placeholder="Nowe hasło" placeholderTextColor="#6B7280"
                  value={newPassword} onChangeText={setNewPassword} secureTextEntry />
              </View>
            ) : (
              <Text style={s.fieldValue}>••••••••</Text>
            )}
          </View>

          {/* Logout */}
          <TouchableOpacity style={s.logoutBtn} onPress={() => { onClose(); logout(); }}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={s.logoutText}>Wyloguj się</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1F2937' },
  title: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  saveText: { color: '#6366F1', fontSize: 16, fontWeight: '600' },
  content: { flex: 1, padding: 16 },
  avatarSection: { alignItems: 'center', marginBottom: 32 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { color: '#FFFFFF', fontSize: 32, fontWeight: 'bold' },
  userName: { color: '#FFFFFF', fontSize: 20, fontWeight: '600' },
  userEmail: { color: '#9CA3AF', fontSize: 14, marginTop: 2 },
  field: { backgroundColor: '#1F2937', borderRadius: 12, padding: 14, marginBottom: 12 },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldLabel: { color: '#9CA3AF', fontSize: 13, flex: 1 },
  fieldValue: { color: '#FFFFFF', fontSize: 16, marginTop: 6 },
  input: { backgroundColor: '#374151', borderRadius: 10, padding: 12, color: '#FFFFFF', fontSize: 16, marginTop: 8, borderWidth: 1, borderColor: '#4B5563' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1F2937', borderRadius: 12, padding: 16, marginTop: 20, gap: 10, borderWidth: 1, borderColor: '#EF444430' },
  logoutText: { color: '#EF4444', fontSize: 16, fontWeight: '600' },
});
