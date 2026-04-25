import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function RootIndex() {
  const { user, loading, initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#faf8f5', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#3d2c1e" />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (user.role === 'counselor') {
    return <Redirect href="/(counselor)/dashboard" />;
  }

  return <Redirect href="/(user)/home" />;
}
