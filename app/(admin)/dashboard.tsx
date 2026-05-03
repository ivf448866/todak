import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { adminGetStats } from '@/lib/supabase';
import { AdminStats } from '@/types';

const C = {
  bg: '#faf8f5', brown: '#3d2c1e', gold: '#f0c98a',
  pale: '#8c7b6b', white: '#ffffff', admin: '#1e293b',
  green: '#16a34a', red: '#dc2626', blue: '#2563eb',
} as const;

const SHORTCUTS = [
  { label: '입금 확인',     icon: '💳', route: '/(admin)/payments',    color: '#fef9c3' },
  { label: '상담사 관리',   icon: '🎧', route: '/(admin)/counselors',  color: '#f0fdf4' },
  { label: '공지사항',      icon: '📢', route: '/(admin)/notices',     color: '#fff7ed' },
  { label: '정산 관리',     icon: '💰', route: '/(admin)/settlements', color: '#f0f9ff' },
] as const;

export default function AdminDashboard() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const s = await adminGetStats();
      setStats(s as AdminStats);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.admin} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* 환영 */}
      <View style={s.welcome}>
        <Text style={s.welcomeTitle}>안녕하세요, {user?.name}님</Text>
        <Text style={s.welcomeSub}>관리자 패널</Text>
      </View>

      {/* 통계 카드 그리드 */}
      {stats && (
        <View style={s.grid}>
          <StatCard label="전체 이용자" value={stats.totalUsers} icon="👥" color="#e0f2fe" />
          <StatCard label="전체 상담사" value={stats.totalCounselors} icon="🎧" color="#f0fdf4" />
          <StatCard label="전체 예약" value={stats.totalBookings} icon="📅" color="#fef9c3" />
          <StatCard label="완료 상담" value={stats.completedBookings} icon="✅" color="#f0fdf4" />
          <StatCard label="총 매출" value={`₩${stats.totalRevenue.toLocaleString()}`} icon="💰" color="#fff7ed" wide />
          <StatCard label="미처리 정산" value={stats.pendingSettlements} icon="⏳" color="#fef2f2" />
        </View>
      )}

      {/* 빠른 메뉴 */}
      <Text style={s.sectionTitle}>빠른 메뉴</Text>
      <View style={s.shortcuts}>
        {SHORTCUTS.map((item) => (
          <TouchableOpacity
            key={item.route}
            style={[s.shortcutCard, { backgroundColor: item.color }]}
            onPress={() => router.push(item.route as any)}
            activeOpacity={0.8}
          >
            <Text style={s.shortcutIcon}>{item.icon}</Text>
            <Text style={s.shortcutLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

function StatCard({ label, value, icon, color, wide }: {
  label: string; value: number | string; icon: string; color: string; wide?: boolean;
}) {
  return (
    <View style={[s.statCard, { backgroundColor: color }, wide && s.statCardWide]}>
      <Text style={s.statIcon}>{icon}</Text>
      <Text style={s.statValue}>{typeof value === 'number' ? value.toLocaleString() : value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: C.bg },
  content:       { padding: 20, paddingBottom: 40 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcome:       { marginBottom: 24 },
  welcomeTitle:  { fontSize: 22, fontWeight: '800', color: C.brown },
  welcomeSub:    { fontSize: 13, color: C.pale, marginTop: 2 },
  grid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  statCard:      { width: '47%', borderRadius: 14, padding: 16, gap: 4 },
  statCardWide:  { width: '100%' },
  statIcon:      { fontSize: 24 },
  statValue:     { fontSize: 22, fontWeight: '900', color: C.brown },
  statLabel:     { fontSize: 12, color: C.pale, fontWeight: '600' },
  sectionTitle:  { fontSize: 16, fontWeight: '800', color: C.brown, marginBottom: 12 },
  shortcuts:     { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  shortcutCard:  { width: '47%', borderRadius: 14, padding: 18, alignItems: 'center', gap: 8 },
  shortcutIcon:  { fontSize: 28 },
  shortcutLabel: { fontSize: 13, fontWeight: '700', color: C.brown, textAlign: 'center' },
});
