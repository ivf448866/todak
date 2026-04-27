import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { CrisisAlert } from '@/components/CrisisAlert';
import {
  registerPushToken,
  setupNotificationResponseHandler,
} from '@/lib/notifications';

const BROWN       = '#3d2c1e';
const BROWN_LIGHT = '#5a4633';
const CREAM       = '#faf8f5';
const GOLD        = '#f0c98a';

function confirm(message: string): boolean {
  if (Platform.OS === 'web') {
    return window.confirm(message);
  }
  return true; // native uses Alert below
}

function DashboardHeaderRight() {
  const { logout } = useAuthStore();
  const router = useRouter();

  async function handleLogout() {
    if (Platform.OS === 'web') {
      if (!confirm('로그아웃 하시겠어요?')) return;
      await logout();
      router.replace('/login');
    } else {
      Alert.alert('로그아웃', '정말 로그아웃 하시겠어요?', [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃', style: 'destructive',
          onPress: async () => { await logout(); router.replace('/login'); },
        },
      ]);
    }
  }

  async function handleSwitchToUser() {
    if (Platform.OS === 'web') {
      if (!confirm('이용자 계정으로 전환하시겠어요?')) return;
      await logout();
      router.replace('/login');
    } else {
      Alert.alert('이용자로 전환', '이용자 계정으로 로그인 화면으로 이동합니다.', [
        { text: '취소', style: 'cancel' },
        {
          text: '전환',
          onPress: async () => { await logout(); router.replace('/login'); },
        },
      ]);
    }
  }

  return (
    <View style={h.row}>
      <TouchableOpacity style={h.btn} onPress={handleSwitchToUser} activeOpacity={0.7}>
        <Text style={h.btnText}>🙋 이용자</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[h.btn, h.btnLogout]} onPress={handleLogout} activeOpacity={0.7}>
        <Text style={[h.btnText, h.btnTextLogout]}>로그아웃</Text>
      </TouchableOpacity>
    </View>
  );
}

const h = StyleSheet.create({
  row:           { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 },
  btn:           { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#f0ebe3' },
  btnLogout:     { backgroundColor: '#3d2c1e' },
  btnText:       { fontSize: 12, fontWeight: '700', color: BROWN },
  btnTextLogout: { color: CREAM },
});

export default function CounselorLayout() {
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user?.id) return;
    registerPushToken(user.id);
    return setupNotificationResponseHandler();
  }, [user?.id]);

  return (
    <View style={s.root}>
      <Stack
        screenOptions={{
          headerStyle:      { backgroundColor: CREAM },
          headerTintColor:  BROWN,
          headerTitleStyle: { fontWeight: '700', color: BROWN },
          headerShadowVisible: false,
          contentStyle:     { backgroundColor: CREAM },
        }}
      >
        <Stack.Screen
          name="dashboard"
          options={{
            title: '토닥토닥',
            headerShown: true,
            headerRight: () => <DashboardHeaderRight />,
          }}
        />
        <Stack.Screen
          name="schedule"
          options={{ title: '스케줄', headerBackTitle: '돌아가기' }}
        />
        <Stack.Screen
          name="education/index"
          options={{ title: '교육 프로그램', headerBackTitle: '돌아가기' }}
        />
        <Stack.Screen
          name="education/[courseId]"
          options={{ title: '강의 보기', headerBackTitle: '교육' }}
        />
        <Stack.Screen
          name="stats"
          options={{ title: '수익 통계', headerBackTitle: '돌아가기' }}
        />
        <Stack.Screen
          name="profile"
          options={{ title: '프로필', headerBackTitle: '돌아가기' }}
        />
      </Stack>

      {/* 위기 알림 오버레이 — 상담사 화면 전체에 마운트 */}
      {!!user?.id && <CrisisAlert counselorId={user.id} />}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
});
