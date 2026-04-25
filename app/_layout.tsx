import '../global.css';
import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

function AuthGuard() {
  const { user, loading, initialize } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (loading) return;

    const inLogin = segments[0] === 'login';

    if (!user && !inLogin) {
      router.replace('/login');
    } else if (user && inLogin) {
      if (user.role === 'counselor') {
        router.replace('/(counselor)/dashboard');
      } else {
        router.replace('/(user)/home');
      }
    }
  }, [user, loading, segments]);

  return null;
}

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
      <AuthGuard />
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(user)" />
      <Stack.Screen name="(counselor)" />
    </Stack>
  );
}
