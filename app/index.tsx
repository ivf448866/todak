import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

const C = { cream: '#faf8f5', brown: '#3d2c1e' };

export default function RootIndex() {
  const router = useRouter();
  const { user, loading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if (user.role === 'counselor') {
      router.replace('/(counselor)/dashboard');
    } else {
      router.replace('/(user)/');
    }
  }, [user, loading]);

  return (
    <View style={{ flex: 1, backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={C.brown} />
    </View>
  );
}
