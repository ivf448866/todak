import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { getUserBookings } from '@/lib/supabase';

const C = {
  cream:      '#faf8f5',
  brown:      '#3d2c1e',
  brownLight: '#5a4633',
  brownPale:  '#8c7b6b',
  gold:       '#f0c98a',
  goldBg:     '#fffbf3',
  white:      '#ffffff',
  sep:        '#f0ebe3',
} as const;

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 82 : 66;

const TABS = [
  { id: 'home',     icon: '🏠', label: '홈',       route: '/(user)/home' },
  { id: 'bookings', icon: '📅', label: '예약내역',  route: '/(user)/bookings' },
  { id: 'chat',     icon: '💬', label: '채팅',      route: '/(user)/chat' },
  { id: 'mypage',   icon: '👤', label: '마이페이지', route: '/(user)/mypage' },
];

type FilterTab = 'upcoming' | 'past';

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: '대기 중',  color: '#f59e0b', bg: '#fef3c7' },
  confirmed:   { label: '확정',     color: '#3b82f6', bg: '#dbeafe' },
  in_progress: { label: '진행 중',  color: '#8b5cf6', bg: '#ede9fe' },
  completed:   { label: '완료',     color: '#16a34a', bg: '#dcfce7' },
  cancelled:   { label: '취소',     color: '#ef4444', bg: '#fee2e2' },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  const days = ['일','월','화','수','목','금','토'];
  const mm   = d.getMonth() + 1;
  const dd   = d.getDate();
  const day  = days[d.getDay()];
  const hh   = String(d.getHours()).padStart(2, '0');
  const min  = String(d.getMinutes()).padStart(2, '0');
  return { date: `${d.getFullYear()}년 ${mm}월 ${dd}일 (${day})`, time: `${hh}:${min}` };
}

export default function BookingsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [bookings, setBookings]     = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filterTab, setFilterTab]   = useState<FilterTab>('upcoming');

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const data = await getUserBookings(user.id);
      setBookings(data ?? []);
    } catch (e) {
      console.error('[예약내역] 조회 실패:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const now = Date.now();
  const upcomingStatuses = new Set(['pending', 'confirmed', 'in_progress']);

  const filtered = bookings
    .filter(b =>
      filterTab === 'upcoming'
        ? upcomingStatuses.has(b.status)
        : !upcomingStatuses.has(b.status)
    )
    .sort((a, b) =>
      filterTab === 'upcoming'
        ? new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
        : new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
    );

  const upcomingCount = bookings.filter(b => upcomingStatuses.has(b.status)).length;

  return (
    <View style={s.root}>
      {/* ── 헤더 ─────────────────────────────────────────── */}
      <View style={s.header}>
        <Text style={s.headerTitle}>예약내역</Text>
        {upcomingCount > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{upcomingCount}</Text>
          </View>
        )}
      </View>

      {/* ── 필터 탭 ──────────────────────────────────────── */}
      <View style={s.filterRow}>
        {(['upcoming', 'past'] as FilterTab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.filterTab, filterTab === t && s.filterTabActive]}
            onPress={() => setFilterTab(t)}
            activeOpacity={0.8}
          >
            <Text style={[s.filterTabText, filterTab === t && s.filterTabTextActive]}>
              {t === 'upcoming' ? '예정 / 진행 중' : '지난 상담'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── 목록 ─────────────────────────────────────────── */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.brown} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>{filterTab === 'upcoming' ? '📅' : '📖'}</Text>
          <Text style={s.emptyTitle}>
            {filterTab === 'upcoming' ? '예정된 상담이 없어요' : '지난 상담 내역이 없어요'}
          </Text>
          {filterTab === 'upcoming' && (
            <TouchableOpacity
              style={s.findBtn}
              onPress={() => router.replace('/(user)/home')}
              activeOpacity={0.8}
            >
              <Text style={s.findBtnText}>상담사 찾아보기</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: TAB_BAR_HEIGHT + 16 }}
          showsVerticalScrollIndicator={false}
        >
          {filtered.map((b, i) => {
            const st           = STATUS_META[b.status] ?? { label: b.status, color: C.brownPale, bg: C.cream };
            const counselorName  = b.counselors?.users?.name ?? b.counselors?.name ?? '상담사';
            const counselorEmoji = b.counselors?.users?.avatar_emoji ?? '🎧';
            const { date, time } = fmtDate(b.scheduled_at);
            const isInProgress   = b.status === 'in_progress';

            return (
              <View key={b.id} style={[s.card, i > 0 && { marginTop: 10 }]}>
                {/* 날짜 헤더 */}
                <View style={s.cardDateRow}>
                  <Text style={s.cardDate}>{date}</Text>
                  <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
                  </View>
                </View>

                {/* 상담사 정보 */}
                <View style={s.counselorRow}>
                  <View style={s.avatarCircle}>
                    <Text style={{ fontSize: 26 }}>{counselorEmoji}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.counselorName}>{counselorName} 상담사</Text>
                    <Text style={s.counselorMeta}>
                      {time} · {b.duration_minutes}분 · ₩{b.amount.toLocaleString()}
                    </Text>
                  </View>
                </View>

                {/* 액션 버튼 */}
                {isInProgress && b.room_url && (
                  <TouchableOpacity
                    style={s.joinBtn}
                    onPress={() => router.push({
                      pathname: '/(user)/session',
                      params: { bookingId: b.id },
                    } as any)}
                    activeOpacity={0.8}
                  >
                    <Text style={s.joinBtnText}>🎙️ 상담 입장하기</Text>
                  </TouchableOpacity>
                )}

                {b.status === 'completed' && !(b.reviews?.length > 0) && (
                  <View style={s.reviewHint}>
                    <Text style={s.reviewHintText}>⭐ 상담은 어떠셨나요? 후기를 남겨주세요</Text>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── 하단 탭바 ─────────────────────────────────────── */}
      <View style={s.tabBar}>
        {TABS.map(tab => {
          const active = tab.id === 'bookings';
          return (
            <TouchableOpacity
              key={tab.id}
              style={s.tabItem}
              onPress={() => { if (!active) router.replace(tab.route as any); }}
              activeOpacity={0.7}
            >
              <Text style={[s.tabIcon, active && s.tabIconActive]}>{tab.icon}</Text>
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.cream },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
    paddingBottom: 14,
    backgroundColor: C.cream,
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: C.brown, letterSpacing: 0.5 },
  badge: {
    backgroundColor: C.brown, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  badgeText: { fontSize: 12, fontWeight: '800', color: C.gold },

  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 4,
  },
  filterTab: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    backgroundColor: C.white, alignItems: 'center',
    borderWidth: 1, borderColor: '#e8e0d4',
  },
  filterTabActive:     { backgroundColor: C.brown, borderColor: C.brown },
  filterTabText:       { fontSize: 13, fontWeight: '700', color: C.brownPale },
  filterTabTextActive: { color: C.gold },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: TAB_BAR_HEIGHT },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 15, color: C.brownPale, marginBottom: 20 },
  findBtn: {
    backgroundColor: C.brown, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 10,
  },
  findBtnText: { fontSize: 14, fontWeight: '800', color: C.cream },

  card: {
    backgroundColor: C.white, borderRadius: 18, padding: 16,
    shadowColor: C.brown, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  cardDateRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
  },
  cardDate:    { fontSize: 13, fontWeight: '700', color: C.brownLight },
  statusBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  statusText:  { fontSize: 12, fontWeight: '700' },

  counselorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: C.goldBg, borderWidth: 1.5, borderColor: C.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  counselorName: { fontSize: 15, fontWeight: '800', color: C.brown, marginBottom: 3 },
  counselorMeta: { fontSize: 12, color: C.brownPale },

  joinBtn: {
    marginTop: 12, backgroundColor: C.brown,
    borderRadius: 12, paddingVertical: 11,
    alignItems: 'center',
  },
  joinBtnText: { fontSize: 14, fontWeight: '800', color: C.cream },

  reviewHint: {
    marginTop: 10, backgroundColor: C.goldBg,
    borderRadius: 10, padding: 10,
  },
  reviewHintText: { fontSize: 12, color: '#92400e', fontWeight: '600' },

  tabBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: TAB_BAR_HEIGHT,
    flexDirection: 'row',
    backgroundColor: C.white,
    borderTopWidth: 1, borderTopColor: C.sep,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  tabItem:      { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
  tabIcon:      { fontSize: 20, marginBottom: 3 },
  tabIconActive: { transform: [{ scale: 1.1 }] },
  tabLabel:     { fontSize: 10, color: C.brownPale, fontWeight: '600' },
  tabLabelActive: { color: C.brown, fontWeight: '800' },
});
