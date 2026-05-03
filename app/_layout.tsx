import 'react-native-get-random-values';
import '../global.css';
import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '@/stores/authStore';

(StyleSheet as any).setFlag?.('darkMode', 'class');
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { user, needsOnboarding, initialized, listenForAuthChanges } = useAuthStore();

  // auth 리스너 등록 — INITIAL_SESSION 이벤트에서 initialized: true 세팅됨
  useEffect(() => {
    const unsubscribe = listenForAuthChanges();
    return unsubscribe;
  }, []);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (!initialized) return;

    const seg0 = segments[0] as string | undefined;

    // OAuth 콜백은 auth/callback.tsx가 직접 라우팅 처리
    if (seg0 === 'auth') return;

    const onLogin      = seg0 === 'login';
    const onIndex      = seg0 === undefined || seg0 === 'index';
    const onOnboarding = seg0 === 'onboarding';
    const inUser       = seg0 === '(user)';
    const inCounselor  = seg0 === '(counselor)';
    const inAdmin      = seg0 === '(admin)';
    const inProtected  = inUser || inCounselor || inAdmin || onOnboarding;

    // ── 미인증 ──────────────────────────────────────────────
    if (!user) {
      // 보호 경로나 인덱스에 있으면 로그인으로
      if (inProtected || onIndex) router.replace('/login');
      // 이미 로그인 화면이면 그대로
      return;
    }

    // ── 온보딩 필요 ─────────────────────────────────────────
    if (needsOnboarding) {
      if (!onOnboarding) router.replace('/onboarding');
      return;
    }

    // ── 인증 완료: 역할에 맞는 홈으로 ────────────────────────
    const home =
      user.role === 'admin'     ? '/(admin)/dashboard'     :
      user.role === 'counselor' ? '/(counselor)/dashboard' :
                                  '/(user)/home';

    const inCorrectGroup =
      user.role === 'admin'     ? inAdmin     :
      user.role === 'counselor' ? inCounselor :
                                  inUser;

    // 로그인 화면·인덱스·틀린 그룹 → 올바른 홈으로 이동
    if (onLogin || onIndex || (!inCorrectGroup && !onOnboarding)) {
      router.replace(home as any);
    }
  }, [user, needsOnboarding, initialized, segments]);

  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index"         options={{ headerShown: false }} />
        <Stack.Screen name="login"         options={{ headerShown: false }} />
        <Stack.Screen name="onboarding"    options={{ headerShown: false }} />
        <Stack.Screen name="(user)"        options={{ headerShown: false }} />
        <Stack.Screen name="(counselor)"   options={{ headerShown: false }} />
        <Stack.Screen name="(admin)"       options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}
