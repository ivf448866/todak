import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuthStore } from '@/stores/authStore';

export default function Index() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  // 네비게이션은 _layout.tsx의 onAuthStateChange + segments effect가 처리
  return (
    <View style={s.container}>
      <Text style={s.logo}>토닥토닥</Text>
      <ActivityIndicator color="#3d2c1e" style={{ marginTop: 24 }} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf8f5', justifyContent: 'center', alignItems: 'center' },
  logo: { fontSize: 40, fontWeight: '900', color: '#3d2c1e', letterSpacing: 4 },
});
