import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import {
  registerPushToken,
  setupNotificationResponseHandler,
} from '@/lib/notifications';

export default function UserLayout() {
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user?.id) return;
    registerPushToken(user.id);
    return setupNotificationResponseHandler();
  }, [user?.id]);

  return (
    <Stack
      screenOptions={{
        headerTintColor: '#3d2c1e',
        headerStyle: { backgroundColor: '#faf8f5' },
        headerTitleStyle: { fontWeight: '700', color: '#3d2c1e' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index"          options={{ headerShown: false }} />
      <Stack.Screen name="counselor/[id]" options={{ title: '경청사 상세',  headerBackTitle: '돌아가기' }} />
      <Stack.Screen name="booking"        options={{ title: '예약',         headerBackTitle: '돌아가기' }} />
      <Stack.Screen name="session"        options={{ title: '상담 세션',    headerBackTitle: '돌아가기' }} />
      <Stack.Screen name="mypage"         options={{ title: '마이페이지',   headerBackTitle: '돌아가기' }} />
    </Stack>
  );
}
