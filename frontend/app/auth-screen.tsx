import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './auth-context';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type Mode = 'login' | 'register' | 'forgot' | 'reset';

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setError(null);
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setResetToken('');
  };

  const switchMode = (next: Mode) => {
    resetForm();
    setMode(next);
  };

  // ── Login / Register ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError('Wypełnij wszystkie pola');
      return;
    }
    if (mode === 'register' && !name.trim()) {
      setError('Podaj swoje imię');
      return;
    }
    if (password.length < 6) {
      setError('Hasło musi mieć min. 6 znaków');
      return;
    }
    setLoading(true);
    const err = mode === 'login'
      ? await login(email.trim(), password)
      : await register(email.trim(), password, name.trim());
    setLoading(false);
    if (err) setError(err);
  };

  // ── Forgot password ───────────────────────────────────────────────────────
  const handleForgotPassword = async () => {
    setError(null);
    if (!email.trim()) {
      setError('Podaj swój adres email');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert(
          'Sprawdź email',
          'Jeśli konto istnieje, wysłaliśmy kod resetowania hasła na podany adres.',
          [{ text: 'OK', onPress: () => switchMode('reset') }]
        );
      } else {
        setError(data.detail || 'Wystąpił błąd. Spróbuj ponownie.');
      }
    } catch {
      setError('Błąd połączenia z serwerem.');
    } finally {
      setLoading(false);
    }
  };

  // ── Reset password ────────────────────────────────────────────────────────
  const handleResetPassword = async () => {
    setError(null);
    if (!resetToken.trim()) {
      setError('Wprowadź kod z emaila');
      return;
    }
    if (newPassword.length < 6) {
      setError('Hasło musi mieć min. 6 znaków');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Hasła nie są identyczne');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken.trim(), new_password: newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert(
          'Hasło zmienione',
          'Możesz się teraz zalogować nowym hasłem.',
          [{ text: 'OK', onPress: () => switchMode('login') }]
        );
      } else {
        setError(data.detail || 'Nieprawidłowy lub wygasły kod.');
      }
    } catch {
      setError('Błąd połączenia z serwerem.');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const renderForm = () => {
    if (mode === 'forgot') {
      return (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Resetuj hasło</Text>
          <Text style={styles.formSubtitle}>
            Podaj swój email, a wyślemy Ci kod resetowania hasła.
          </Text>

          <View style={styles.inputGroup}>
            <Ionicons name="mail-outline" size={20} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#6B7280"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {error && <ErrorBox message={error} />}

          <TouchableOpacity style={styles.submitButton} onPress={handleForgotPassword} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Wyślij kod</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.toggleButton} onPress={() => switchMode('login')}>
            <Text style={styles.toggleText}>
              Wróć do <Text style={styles.toggleHighlight}>logowania</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.toggleButton, { marginTop: 8 }]} onPress={() => switchMode('reset')}>
            <Text style={styles.toggleText}>
              Masz już kod? <Text style={styles.toggleHighlight}>Wprowadź kod</Text>
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (mode === 'reset') {
      return (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Nowe hasło</Text>
          <Text style={styles.formSubtitle}>
            Wprowadź 6-cyfrowy kod z emaila i ustaw nowe hasło.
          </Text>

          <View style={styles.inputGroup}>
            <Ionicons name="key-outline" size={20} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Kod 6-cyfrowy"
              placeholderTextColor="#6B7280"
              value={resetToken}
              onChangeText={setResetToken}
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>

          <View style={styles.inputGroup}>
            <Ionicons name="lock-closed-outline" size={20} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Nowe hasło"
              placeholderTextColor="#6B7280"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
            />
          </View>

          <View style={styles.inputGroup}>
            <Ionicons name="lock-closed-outline" size={20} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Powtórz nowe hasło"
              placeholderTextColor="#6B7280"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
          </View>

          {error && <ErrorBox message={error} />}

          <TouchableOpacity style={styles.submitButton} onPress={handleResetPassword} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Zmień hasło</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.toggleButton} onPress={() => switchMode('forgot')}>
            <Text style={styles.toggleText}>
              Nie masz kodu? <Text style={styles.toggleHighlight}>Wyślij ponownie</Text>
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.form}>
        <Text style={styles.formTitle}>
          {mode === 'login' ? 'Zaloguj się' : 'Utwórz konto'}
        </Text>

        {mode === 'register' && (
          <View style={styles.inputGroup}>
            <Ionicons name="person-outline" size={20} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              data-testid="auth-name-input"
              style={styles.input}
              placeholder="Imię"
              placeholderTextColor="#6B7280"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>
        )}

        <View style={styles.inputGroup}>
          <Ionicons name="mail-outline" size={20} color="#6B7280" style={styles.inputIcon} />
          <TextInput
            data-testid="auth-email-input"
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#6B7280"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Ionicons name="lock-closed-outline" size={20} color="#6B7280" style={styles.inputIcon} />
          <TextInput
            data-testid="auth-password-input"
            style={styles.input}
            placeholder="Hasło"
            placeholderTextColor="#6B7280"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        {error && <ErrorBox message={error} />}

        <TouchableOpacity
          data-testid="auth-submit-button"
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitText}>
              {mode === 'login' ? 'Zaloguj się' : 'Zarejestruj się'}
            </Text>
          )}
        </TouchableOpacity>

        {mode === 'login' && (
          <TouchableOpacity style={styles.forgotButton} onPress={() => switchMode('forgot')}>
            <Text style={styles.forgotText}>Nie pamiętasz hasła?</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          data-testid="auth-toggle-mode"
          style={styles.toggleButton}
          onPress={() => switchMode(mode === 'login' ? 'register' : 'login')}
        >
          <Text style={styles.toggleText}>
            {mode === 'login' ? 'Nie masz konta? ' : 'Masz już konto? '}
            <Text style={styles.toggleHighlight}>
              {mode === 'login' ? 'Zarejestruj się' : 'Zaloguj się'}
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.logoSection}>
            <Image
              source={require('../assets/images/Ferment Tracker Icon.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
            <Text style={styles.appName}>Ferment Tracker</Text>
            <Text style={styles.appTagline}>Twój dziennik nastroju</Text>
          </View>
          {renderForm()}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <View style={styles.errorBox}>
      <Ionicons name="alert-circle" size={16} color="#EF4444" />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoSection: { alignItems: 'center', marginBottom: 40 },
  logoImage: {
    width: 110, height: 110, borderRadius: 24,
    marginBottom: 16,
  },
  appName: { color: '#FFFFFF', fontSize: 28, fontWeight: 'bold' },
  appTagline: { color: '#9CA3AF', fontSize: 15, marginTop: 4 },
  form: { backgroundColor: '#1F2937', borderRadius: 16, padding: 24 },
  formTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  formSubtitle: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  inputGroup: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#374151', borderRadius: 12, marginBottom: 14,
    borderWidth: 1, borderColor: '#4B5563',
  },
  inputIcon: { paddingLeft: 14 },
  input: { flex: 1, color: '#FFFFFF', fontSize: 16, padding: 14 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EF444420', borderRadius: 10,
    padding: 12, marginBottom: 14, gap: 8,
  },
  errorText: { color: '#FCA5A5', fontSize: 14, flex: 1 },
  submitButton: {
    backgroundColor: '#6366F1', borderRadius: 12,
    padding: 16, alignItems: 'center', marginBottom: 16,
  },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  forgotButton: { alignItems: 'center', marginBottom: 12 },
  forgotText: { color: '#6366F1', fontSize: 14 },
  toggleButton: { alignItems: 'center' },
  toggleText: { color: '#9CA3AF', fontSize: 14 },
  toggleHighlight: { color: '#6366F1', fontWeight: '600' },
});
