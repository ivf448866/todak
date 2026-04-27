import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export default function AuthCallback() {
  const router = useRouter();
  const { finalizeGoogleSignIn } = useAuthStore();

  useEffect(() => {
    const handle = async () => {
      try {
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search);
          const code = params.get('code');
          if (code) {
            await supabase.auth.exchangeCodeForSession(code).catch(() => {});
          }
        }

        await finalizeGoogleSignIn();

        const { user } = useAuthStore.getState();
        if (!user) {
          router.replace('/login');
          return;
        }
        const home =
          user.role === 'admin'     ? '/(admin)/dashboard'     :
          user.role === 'counselor' ? '/(counselor)/dashboard' :
                                      '/(user)/home';
        router.replace(home as any);
      } catch (e) {
        console.error('[auth/callback]', e);
        router.replace('/login');
      }
    };
    handle();
  }, []);

  return (
    <View style={s.container}>
      <Text style={s.text}>로그인 처리 중...</Text>
      <ActivityIndicator color="#3d2c1e" style={{ marginTop: 16 }} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf8f5', alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 16, color: '#3d2c1e', fontWeight: '600' },
});
