import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { registerPushToken, setupNotificationResponseHandler } from '@/lib/notifications';

export default function UserLayout() {
  const { user, loading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    registerPushToken(user.id);
    return setupNotificationResponseHandler();
  }, [user?.id]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#faf8f5', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#3d2c1e" />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;

  return (
    <Stack
      screenOptions={{
        headerTintColor: '#3d2c1e',
        headerStyle: { backgroundColor: '#faf8f5' },
        headerTitleStyle: { fontWeight: '700', color: '#3d2c1e' },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="home"           options={{ headerShown: false }} />
      <Stack.Screen name="counselor/[id]" options={{ title: '상담사 상세',  headerBackTitle: '돌아가기' }} />
      <Stack.Screen name="booking"        options={{ title: '예약',         headerBackTitle: '돌아가기' }} />
      <Stack.Screen name="session"        options={{ title: '상담 세션',    headerBackTitle: '돌아가기' }} />
      <Stack.Screen name="mypage"         options={{ title: '마이페이지',   headerBackTitle: '돌아가기' }} />
      <Stack.Screen name="bookings"       options={{ headerShown: false }} />
      <Stack.Screen name="chat"           options={{ headerShown: false }} />
    </Stack>
  );
}
