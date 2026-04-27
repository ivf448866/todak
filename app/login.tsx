import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '@/stores/authStore';
import { isSupabaseConfigured, getGoogleOAuthUrl, supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const C = {
  cream: '#faf8f5', brown: '#3d2c1e', brownLight: '#5a4633',
  brownPale: '#8c7b6b', gold: '#f0c98a', goldLight: '#f5ddb5',
  white: '#ffffff', red: '#ef4444',
} as const;

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signUp, finalizeGoogleSignIn, loading, error, clearError } = useAuthStore();

  const [mode, setMode]   = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]   = useState('');
  const [role, setRole]   = useState<'user' | 'counselor'>('user');
  const [devInfo, setDevInfo] = useState('');

  const handleGoogleLogin = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert('Supabase 미설정', '.env.local을 먼저 설정해주세요.');
      return;
    }
    try {
      if (Platform.OS === 'web') {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8081';
        const redirectTo = `${origin}/auth/callback`;
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo },
        });
        if (oauthError) throw oauthError;
        return;
      }
      const redirectUrl = Linking.createURL('/');
      const oauthUrl = await getGoogleOAuthUrl(redirectUrl);
      if (!oauthUrl) throw new Error('OAuth URL 생성 실패');
      const result = await WebBrowser.openAuthSessionAsync(oauthUrl, redirectUrl);
      if (result.type === 'success') {
        const parsed = Linking.parse(result.url);
        const code = parsed.queryParams?.code as string | undefined;
        if (code) await supabase.auth.exchangeCodeForSession(code);
        await finalizeGoogleSignIn();
      }
    } catch (e: any) {
      Alert.alert('구글 로그인 오류', e.message ?? '알 수 없는 오류');
    }
  };

  const handleSubmit = async () => {
    clearError();
    setDevInfo('');
    try {
      if (mode === 'login') {
        await signIn(email.trim(), password);

        // 로그인 후 실제 store 상태 확인
        const state = useAuthStore.getState();
        const { user: u, needsOnboarding: ob, initialized: init } = state;

        if (__DEV__) {
          setDevInfo(`role=${u?.role ?? 'null'} | onboarding=${ob} | init=${init}`);
        }

        if (!u) return; // signIn 실패 — error는 store에 세팅됨

        // 명시적 네비게이션 (+ _layout.tsx 백업)
        if (u.role === 'admin') {
          router.replace('/(admin)/dashboard' as any);
        } else if (u.role === 'counselor') {
          router.replace('/(counselor)/dashboard' as any);
        } else {
          router.replace('/(user)/home' as any);
        }
      } else {
        if (!name.trim()) { Alert.alert('이름을 입력해주세요'); return; }
        await signUp(email.trim(), password, name.trim(), role);
        Alert.alert('가입 완료', '이메일 인증 후 로그인해주세요.');
        setMode('login');
      }
    } catch (_e) {
      // error는 store에 세팅되어 UI에 표시됨
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.cream }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        {/* Supabase 미설정 배너 */}
        {!isSupabaseConfigured && (
          <View style={s.setupBanner}>
            <Text style={s.setupBannerText}>⚠️ .env.local에 Supabase URL과 KEY를 설정해야 로그인이 가능합니다.</Text>
          </View>
        )}

        {/* Logo */}
        <View style={s.logoWrap}>
          <Image
            source={require('../assets/logo_todak.jpeg')}
            style={s.logoImage}
            resizeMode="contain"
          />
          <Text style={s.logo}>토닥토닥</Text>
          <Text style={s.tagline}>귀 기울여 드려요</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          {/* Mode Tabs */}
          <View style={s.tabs}>
            {(['login', 'signup'] as const).map((m) => (
              <TouchableOpacity
                key={m} onPress={() => { setMode(m); clearError(); setDevInfo(''); }}
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

          {/* Dev info */}
          {__DEV__ && !!devInfo && (
            <View style={s.devBox}>
              <Text style={s.devText}>🔍 {devInfo}</Text>
            </View>
          )}

          {/* Name (signup only) */}
          {mode === 'signup' && (
            <View style={s.fieldWrap}>
              <Text style={s.label}>이름</Text>
              <TextInput
                style={s.input} placeholder="홍길동" placeholderTextColor={C.brownPale}
                value={name} onChangeText={setName} autoComplete="name"
              />
            </View>
          )}

          {/* Email */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>이메일</Text>
            <TextInput
              style={s.input} placeholder="example@email.com" placeholderTextColor={C.brownPale}
              value={email} onChangeText={setEmail}
              keyboardType="email-address" autoCapitalize="none" autoComplete="email"
            />
          </View>

          {/* Password */}
          <View style={s.fieldWrap}>
            <Text style={s.label}>비밀번호</Text>
            <TextInput
              style={s.input} placeholder="8자 이상" placeholderTextColor={C.brownPale}
              value={password} onChangeText={setPassword}
              secureTextEntry autoComplete="password"
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
                      {r === 'user' ? '🙋 이용자' : '🎧 상담사'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, loading && { opacity: 0.6 }]}
            onPress={handleSubmit} disabled={loading} activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={C.brown} />
              : <Text style={s.submitText}>{mode === 'login' ? '로그인' : '가입하기'}</Text>
            }
          </TouchableOpacity>

          {/* Divider */}
          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>또는</Text>
            <View style={s.dividerLine} />
          </View>

          {/* Google Login */}
          <TouchableOpacity
            style={[s.googleBtn, loading && { opacity: 0.6 }]}
            onPress={handleGoogleLogin} disabled={loading} activeOpacity={0.85}
          >
            <Text style={s.googleIcon}>G</Text>
            <Text style={s.googleText}>Google로 계속하기</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:       { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 },
  setupBanner:     { backgroundColor: '#fef3c7', borderRadius: 10, padding: 12, marginBottom: 16 },
  setupBannerText: { fontSize: 12, color: '#92400e', lineHeight: 18 },
  logoWrap:        { alignItems: 'center', marginBottom: 40 },
  logoImage:       { width: 100, height: 100, marginBottom: 12 },
  logo:            { fontSize: 32, fontWeight: '900', color: C.brown, letterSpacing: 3 },
  tagline:         { fontSize: 13, color: C.brownPale, marginTop: 4 },
  card: {
    backgroundColor: C.white, borderRadius: 20, padding: 24,
    shadowColor: C.brown, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 16, elevation: 6,
  },
  tabs:          { flexDirection: 'row', marginBottom: 20, backgroundColor: '#f0ebe3', borderRadius: 12, padding: 4 },
  tab:           { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 9 },
  tabActive:     { backgroundColor: C.brown },
  tabText:       { fontSize: 14, fontWeight: '600', color: C.brownPale },
  tabTextActive: { color: C.white },
  errorBox:      { backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 16 },
  errorText:     { fontSize: 13, color: C.red },
  devBox:        { backgroundColor: '#1e293b', borderRadius: 8, padding: 10, marginBottom: 12 },
  devText:       { fontSize: 11, color: '#94a3b8', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  fieldWrap:     { marginBottom: 16 },
  label:         { fontSize: 13, fontWeight: '600', color: C.brownLight, marginBottom: 6 },
  input: {
    backgroundColor: '#f7f4ef', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: C.brown, borderWidth: 1, borderColor: '#e8e0d5',
  },
  roleRow:          { flexDirection: 'row', gap: 10 },
  roleBtn:          { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#f0ebe3', borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  roleBtnActive:    { backgroundColor: C.goldLight, borderColor: C.gold },
  roleBtnText:      { fontSize: 14, fontWeight: '600', color: C.brownPale },
  roleBtnTextActive:{ color: C.brown },
  submitBtn:     { backgroundColor: C.gold, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  submitText:    { fontSize: 16, fontWeight: '800', color: C.brown },
  divider:       { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  dividerLine:   { flex: 1, height: 1, backgroundColor: '#e8e0d5' },
  dividerText:   { marginHorizontal: 12, fontSize: 12, color: C.brownPale },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.white, borderRadius: 12, paddingVertical: 13,
    borderWidth: 1.5, borderColor: '#e8e0d5', gap: 10,
  },
  googleIcon: { fontSize: 16, fontWeight: '900', color: '#4285F4' },
  googleText: { fontSize: 15, fontWeight: '600', color: C.brown },
});
