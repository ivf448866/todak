import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

const C = {
  bg: '#faf8f5', brown: '#3d2c1e', gold: '#f0c98a',
  cream: '#faf8f5', pale: '#8c7b6b', white: '#ffffff',
  adminAccent: '#1e293b',
} as const;

const TABS = [
  { label: '대시보드', icon: '📊', route: '/(admin)/dashboard' },
  { label: '교육',     icon: '📚', route: '/(admin)/courses' },
  { label: '상담사',   icon: '🎧', route: '/(admin)/counselors' },
  { label: '공지',     icon: '📢', route: '/(admin)/notices' },
  { label: '정산',     icon: '💰', route: '/(admin)/settlements' },
] as const;

function AdminTabBar() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={tb.bar}>
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.route.replace('/(admin)', ''));
        return (
          <TouchableOpacity
            key={tab.route}
            style={tb.item}
            onPress={() => router.replace(tab.route as any)}
            activeOpacity={0.7}
          >
            <Text style={tb.icon}>{tab.icon}</Text>
            <Text style={[tb.label, active && tb.labelActive]}>{tab.label}</Text>
            {active && <View style={tb.dot} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const tb = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: C.white,
    borderTopWidth: 1, borderTopColor: '#e8e0d5',
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
    paddingTop: 8,
  },
  item:       { flex: 1, alignItems: 'center', gap: 2 },
  icon:       { fontSize: 20 },
  label:      { fontSize: 10, color: C.pale, fontWeight: '600' },
  labelActive:{ color: C.adminAccent },
  dot:        { width: 4, height: 4, borderRadius: 2, backgroundColor: C.gold, marginTop: 1 },
});

function AdminHeaderRight() {
  const { logout } = useAuthStore();
  const router = useRouter();

  async function handleLogout() {
    const doLogout = async () => { await logout(); router.replace('/login'); };
    if (Platform.OS === 'web') {
      if (window.confirm('로그아웃 하시겠어요?')) doLogout();
    } else {
      Alert.alert('로그아웃', '정말 로그아웃 하시겠어요?', [
        { text: '취소', style: 'cancel' },
        { text: '로그아웃', style: 'destructive', onPress: doLogout },
      ]);
    }
  }

  return (
    <TouchableOpacity style={h.btn} onPress={handleLogout} activeOpacity={0.7}>
      <Text style={h.btnText}>로그아웃</Text>
    </TouchableOpacity>
  );
}

const h = StyleSheet.create({
  btn:     { marginRight: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: C.adminAccent },
  btnText: { fontSize: 12, fontWeight: '700', color: C.white },
});

export default function AdminLayout() {
  const { user } = useAuthStore();

  return (
    <View style={s.root}>
      <Stack
        screenOptions={{
          headerStyle:      { backgroundColor: C.adminAccent },
          headerTintColor:  C.white,
          headerTitleStyle: { fontWeight: '700', color: C.white },
          headerShadowVisible: false,
          contentStyle:     { backgroundColor: C.bg },
        }}
      >
        <Stack.Screen
          name="dashboard"
          options={{ title: '관리자 대시보드', headerRight: () => <AdminHeaderRight /> }}
        />
        <Stack.Screen name="courses"     options={{ title: '교육 과정 관리',   headerBackTitle: '돌아가기' }} />
        <Stack.Screen name="counselors"  options={{ title: '상담사 관리',       headerBackTitle: '돌아가기' }} />
        <Stack.Screen name="notices"     options={{ title: '공지사항 관리',     headerBackTitle: '돌아가기' }} />
        <Stack.Screen name="settlements" options={{ title: '정산 관리',         headerBackTitle: '돌아가기' }} />
      </Stack>
      <AdminTabBar />
    </View>
  );
}

const s = StyleSheet.create({ root: { flex: 1 } });
