import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { UserRole } from '@/types';

const C = {
  cream: '#faf8f5', brown: '#3d2c1e', brownLight: '#5a4633',
  brownPale: '#8c7b6b', gold: '#f0c98a', goldLight: '#f5ddb5',
  white: '#ffffff',
} as const;

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, completeOnboarding, loading } = useAuthStore();
  const [selected, setSelected] = useState<UserRole | null>(null);

  const handleConfirm = async () => {
    if (!selected) {
      Alert.alert('역할을 선택해주세요');
      return;
    }
    try {
      await completeOnboarding(selected);
      if (selected === 'counselor') {
        router.replace('/(counselor)/dashboard');
      } else {
        router.replace('/(user)/home');
      }
    } catch (e: any) {
      Alert.alert('오류', e.message);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.logo}>토닥토닥</Text>
        <Text style={s.greeting}>
          {user?.name ? `${user.name}님, 반갑습니다!` : '반갑습니다!'}
        </Text>
        <Text style={s.sub}>어떤 역할로 이용하실 건가요?</Text>
      </View>

      <View style={s.cards}>
        <TouchableOpacity
          style={[s.card, selected === 'user' && s.cardSelected]}
          onPress={() => setSelected('user')}
          activeOpacity={0.85}
        >
          <Text style={s.cardEmoji}>🙋</Text>
          <Text style={[s.cardTitle, selected === 'user' && s.cardTitleSelected]}>이용자</Text>
          <Text style={s.cardDesc}>상담사와 상담을 예약하고{'\n'}마음을 나눠요</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.card, selected === 'counselor' && s.cardSelected]}
          onPress={() => setSelected('counselor')}
          activeOpacity={0.85}
        >
          <Text style={s.cardEmoji}>🎧</Text>
          <Text style={[s.cardTitle, selected === 'counselor' && s.cardTitleSelected]}>상담사</Text>
          <Text style={s.cardDesc}>이용자의 이야기를 듣고{'\n'}함께 고민해드려요</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[s.confirmBtn, (!selected || loading) && s.confirmBtnDisabled]}
        onPress={handleConfirm}
        disabled={!selected || loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color={C.brown} />
          : <Text style={s.confirmText}>시작하기</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: C.cream,
    paddingHorizontal: 24, paddingTop: 80, paddingBottom: 40,
    justifyContent: 'space-between',
  },
  header: { alignItems: 'center', gap: 8 },
  logo: { fontSize: 32, fontWeight: '900', color: C.brown, letterSpacing: 4, marginBottom: 8 },
  greeting: { fontSize: 22, fontWeight: '800', color: C.brown },
  sub: { fontSize: 15, color: C.brownPale, marginTop: 4 },
  cards: { flexDirection: 'row', gap: 14 },
  card: {
    flex: 1, alignItems: 'center', paddingVertical: 28, paddingHorizontal: 12,
    backgroundColor: C.white, borderRadius: 20,
    borderWidth: 2, borderColor: 'transparent',
    shadowColor: C.brown, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  cardSelected: { borderColor: C.gold, backgroundColor: '#fffbf3' },
  cardEmoji: { fontSize: 40, marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: C.brownLight, marginBottom: 8 },
  cardTitleSelected: { color: C.brown },
  cardDesc: { fontSize: 13, color: C.brownPale, textAlign: 'center', lineHeight: 20 },
  confirmBtn: {
    backgroundColor: C.gold, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmText: { fontSize: 17, fontWeight: '800', color: C.brown },
});
