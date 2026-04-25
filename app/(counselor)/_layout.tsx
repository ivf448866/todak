import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
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
            title: '토닥',
            headerShown: true,
            headerRight: () => null,
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

      {/* 위기 알림 오버레이 — 경청사 화면 전체에 마운트 */}
      {!!user?.id && <CrisisAlert counselorId={user.id} />}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
});
