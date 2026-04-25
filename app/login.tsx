import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

const C = {
  cream: '#faf8f5', brown: '#3d2c1e', brownLight: '#5a4633',
  brownPale: '#8c7b6b', gold: '#f0c98a', goldLight: '#f5ddb5',
  white: '#ffffff', red: '#ef4444',
} as const;

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signUp, loading, error, clearError } = useAuthStore();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'user' | 'counselor'>('user');

  const handleSubmit = async () => {
    clearError();
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);
        const { user } = useAuthStore.getState();
        if (user?.role === 'counselor') {
          router.replace('/(counselor)/dashboard');
        } else {
          router.replace('/(user)/');
        }
      } else {
        if (!name.trim()) { Alert.alert('이름을 입력해주세요'); return; }
        await signUp(email.trim(), password, name.trim(), role);
        Alert.alert('가입 완료', '이메일 인증 후 로그인해주세요.');
        setMode('login');
      }
    } catch (e: any) {
      // error is set in store
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.cream }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={s.logoWrap}>
          <Text style={s.logo}>토닥</Text>
          <Text style={s.tagline}>귀 기울여 드려요</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          {/* Mode Tabs */}
          <View style={s.tabs}>
            {(['login', 'signup'] as const).map((m) => (
              <TouchableOpacity
                key={m} onPress={() => { setMode(m); clearError(); }}
                style={[s.tab, mode === m && s.tabActive]}
              >
                <Text style={[s.tabText, mode === m && s.tabTextActive]}>
                  {m === 'login' ? '로그인' : '회원가입'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Error */}
          {!!error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* Name (signup only) */}
          {mode === 'signup' && (
            <View style={s.fieldWrap}>
              <Text style={s.label}>이름</Text>
              <TextInput
                style={s.input}
                placeholder="홍길동"
                placeholderTextColor={C.brownPale}
                value={name}
                onChangeText={setName}
                autoComplete="name"
              />
            </View>
          )}

          {/* Email */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>이메일</Text>
            <TextInput
              style={s.input}
              placeholder="example@email.com"
              placeholderTextColor={C.brownPale}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
          </View>

          {/* Password */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>비밀번호</Text>
            <TextInput
              style={s.input}
              placeholder="8자 이상"
              placeholderTextColor={C.brownPale}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
            />
          </View>

          {/* Role (signup only) */}
          {mode === 'signup' && (
            <View style={s.fieldWrap}>
              <Text style={s.label}>가입 유형</Text>
              <View style={s.roleRow}>
                {(['user', 'counselor'] as const).map((r) => (
                  <TouchableOpacity
                    key={r} onPress={() => setRole(r)}
                    style={[s.roleBtn, role === r && s.roleBtnActive]}
                  >
                    <Text style={[s.roleBtnText, role === r && s.roleBtnTextActive]}>
                      {r === 'user' ? '🙋 이용자' : '🎧 경청사'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={C.brown} />
              : <Text style={s.submitText}>{mode === 'login' ? '로그인' : '가입하기'}</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  logoWrap: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 40, fontWeight: '900', color: C.brown, letterSpacing: 4 },
  tagline: { fontSize: 13, color: C.brownPale, marginTop: 4 },
  card: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 24,
    shadowColor: C.brown,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  tabs: { flexDirection: 'row', marginBottom: 20, backgroundColor: '#f0ebe3', borderRadius: 12, padding: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 9 },
  tabActive: { backgroundColor: C.brown },
  tabText: { fontSize: 14, fontWeight: '600', color: C.brownPale },
  tabTextActive: { color: C.white },
  errorBox: { backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 16 },
  errorText: { fontSize: 13, color: C.red },
  fieldWrap: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: C.brownLight, marginBottom: 6 },
  input: {
    backgroundColor: '#f7f4ef',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: C.brown,
    borderWidth: 1,
    borderColor: '#e8e0d5',
  },
  roleRow: { flexDirection: 'row', gap: 10 },
  roleBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    backgroundColor: '#f0ebe3', borderRadius: 10,
    borderWidth: 1, borderColor: 'transparent',
  },
  roleBtnActive: { backgroundColor: C.goldLight, borderColor: C.gold },
  roleBtnText: { fontSize: 14, fontWeight: '600', color: C.brownPale },
  roleBtnTextActive: { color: C.brown },
  submitBtn: {
    backgroundColor: C.gold, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  submitText: { fontSize: 16, fontWeight: '800', color: C.brown },
});
