import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function RootLayout() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="(user)" />
      <Stack.Screen name="(counselor)" />
    </Stack>
  );
}
