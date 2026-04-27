import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';

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

// 세션 시작 30분 전부터 "곧 시작" 안내 표시
const SOON_THRESHOLD_MS = 30 * 60 * 1000;

type ActiveBooking = {
  id: string;
  scheduled_at: string;
  status: 'in_progress' | 'confirmed' | 'pending';
  room_url: string | null;
  counselor_name: string;
  counselor_emoji: string;
};

function fmtDatetime(iso: string) {
  const d = new Date(iso);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const mm  = d.getMonth() + 1;
  const dd  = d.getDate();
  const day = days[d.getDay()];
  const hh  = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}월 ${dd}일 (${day}) ${hh}:${min}`;
}

function minsUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 60000);
}

export default function ChatScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [loading, setLoading]     = useState(true);
  const [inProgress, setInProgress] = useState<ActiveBooking | null>(null);
  const [upcoming, setUpcoming]   = useState<ActiveBooking | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const { data } = await supabase
        .from('bookings')
        .select('id, scheduled_at, status, room_url, counselors(users(name, avatar_emoji))')
        .eq('user_id', user.id)
        .in('status', ['in_progress', 'confirmed', 'pending'])
        .order('scheduled_at', { ascending: true });

      if (!data?.length) return;

      const map = (b: any): ActiveBooking => ({
        id: b.id,
        scheduled_at: b.scheduled_at,
        status: b.status,
        room_url: b.room_url ?? null,
        counselor_name: b.counselors?.users?.name ?? '상담사',
        counselor_emoji: b.counselors?.users?.avatar_emoji ?? '🎧',
      });

      const active = data.find(b => b.status === 'in_progress');
      if (active) { setInProgress(map(active)); return; }

      // 가장 가까운 예정 예약
      const next = data[0];
      setUpcoming(map(next));
    } catch (e) {
      console.error('[채팅] 조회 실패:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // 30초마다 상태 갱신 (in_progress 전환 감지)
  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const renderContent = () => {
    if (loading) {
      return (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.brown} />
        </View>
      );
    }

    // ── 진행 중인 상담 ────────────────────────────────────────────────
    if (inProgress) {
      return (
        <View style={s.center}>
          <View style={s.pulseCircle}>
            <Text style={{ fontSize: 44 }}>{inProgress.counselor_emoji}</Text>
          </View>
          <View style={s.liveBadge}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>상담 진행 중</Text>
          </View>
          <Text style={s.counselorName}>{inProgress.counselor_name} 상담사</Text>
          <Text style={s.subText}>{fmtDatetime(inProgress.scheduled_at)}</Text>

          <TouchableOpacity
            style={s.enterBtn}
            onPress={() =>
              router.push({
                pathname: '/(user)/session',
                params: { bookingId: inProgress.id },
              } as any)
            }
            activeOpacity={0.85}
          >
            <Text style={s.enterBtnText}>🎙️ 상담 입장하기</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // ── 30분 이내 예정 상담 ──────────────────────────────────────────
    if (upcoming) {
      const mins = minsUntil(upcoming.scheduled_at);
      const isSoon = mins <= 30 && mins >= 0;

      if (isSoon) {
        return (
          <View style={s.center}>
            <Text style={{ fontSize: 52, marginBottom: 16 }}>{upcoming.counselor_emoji}</Text>
            <View style={[s.liveBadge, { backgroundColor: '#fef3c7' }]}>
              <Text style={{ fontSize: 12, color: '#92400e', fontWeight: '800' }}>
                ⏰ {mins}분 후 시작
              </Text>
            </View>
            <Text style={s.counselorName}>{upcoming.counselor_name} 상담사</Text>
            <Text style={s.subText}>{fmtDatetime(upcoming.scheduled_at)}</Text>
            <Text style={s.hintText}>
              상담사가 세션을 시작하면{'\n'}입장 버튼이 활성화됩니다
            </Text>
          </View>
        );
      }

      // 30분 이후 예정 있음
      return (
        <View style={s.center}>
          <Text style={s.noSessionIcon}>💬</Text>
          <Text style={s.noSessionTitle}>현재 채팅 상황이 아닙니다</Text>
          <Text style={s.noSessionSub}>
            예약된 상담 시간에 이 화면으로{'\n'}돌아오시면 입장할 수 있어요
          </Text>

          <View style={s.nextCard}>
            <Text style={s.nextLabel}>다음 상담</Text>
            <View style={s.nextRow}>
              <View style={s.nextAvatar}>
                <Text style={{ fontSize: 24 }}>{upcoming.counselor_emoji}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.nextName}>{upcoming.counselor_name} 상담사</Text>
                <Text style={s.nextTime}>{fmtDatetime(upcoming.scheduled_at)}</Text>
              </View>
              <View style={s.nextMinBadge}>
                <Text style={s.nextMinText}>
                  {mins >= 60
                    ? `${Math.floor(mins / 60)}시간 후`
                    : `${mins}분 후`}
                </Text>
              </View>
            </View>
          </View>
        </View>
      );
    }

    // ── 예정된 상담 없음 ─────────────────────────────────────────────
    return (
      <View style={s.center}>
        <Text style={s.noSessionIcon}>💬</Text>
        <Text style={s.noSessionTitle}>현재 채팅 상황이 아닙니다</Text>
        <Text style={s.noSessionSub}>
          상담을 예약하면{'\n'}해당 시간에 이 화면에서 입장할 수 있어요
        </Text>
        <TouchableOpacity
          style={s.bookBtn}
          onPress={() => router.replace('/(user)/home' as any)}
          activeOpacity={0.85}
        >
          <Text style={s.bookBtnText}>상담사 찾아보기</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.headerTitle}>채팅</Text>
      </View>

      <View style={{ flex: 1, paddingBottom: TAB_BAR_HEIGHT }}>
        {renderContent()}
      </View>

      <View style={s.tabBar}>
        {TABS.map(tab => {
          const active = tab.id === 'chat';
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
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 24,
    paddingBottom: 14,
    backgroundColor: C.cream,
  },
  headerTitle: { fontSize: 22, fontWeight: '900', color: C.brown, letterSpacing: 0.5 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },

  // In-progress
  pulseCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: C.goldBg, borderWidth: 3, borderColor: C.gold,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#dcfce7', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6, marginBottom: 14,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16a34a' },
  liveText: { fontSize: 13, fontWeight: '800', color: '#16a34a' },

  counselorName: { fontSize: 20, fontWeight: '900', color: C.brown, marginBottom: 4 },
  subText: { fontSize: 13, color: C.brownPale, marginBottom: 28 },
  hintText: { fontSize: 13, color: C.brownPale, textAlign: 'center', lineHeight: 20, marginTop: 12 },

  enterBtn: {
    backgroundColor: C.brown, borderRadius: 14,
    paddingHorizontal: 36, paddingVertical: 16,
  },
  enterBtnText: { fontSize: 16, fontWeight: '800', color: C.cream },

  // No session
  noSessionIcon:  { fontSize: 56, marginBottom: 16, opacity: 0.35 },
  noSessionTitle: { fontSize: 18, fontWeight: '900', color: C.brown, marginBottom: 10 },
  noSessionSub: {
    fontSize: 14, color: C.brownPale, textAlign: 'center',
    lineHeight: 22, marginBottom: 28,
  },

  bookBtn: {
    backgroundColor: C.brown, borderRadius: 12,
    paddingHorizontal: 28, paddingVertical: 12,
  },
  bookBtnText: { fontSize: 14, fontWeight: '800', color: C.cream },

  // Next booking card
  nextCard: {
    width: '100%', backgroundColor: C.white, borderRadius: 16,
    padding: 16, marginTop: 8,
    shadowColor: C.brown, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  nextLabel: { fontSize: 11, fontWeight: '700', color: C.brownPale, marginBottom: 10, letterSpacing: 0.4 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.goldBg, borderWidth: 1.5, borderColor: C.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  nextName: { fontSize: 15, fontWeight: '800', color: C.brown },
  nextTime: { fontSize: 12, color: C.brownPale, marginTop: 2 },
  nextMinBadge: {
    backgroundColor: C.cream, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  nextMinText: { fontSize: 11, fontWeight: '700', color: C.brownLight },

  // Tab bar
  tabBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: TAB_BAR_HEIGHT,
    flexDirection: 'row',
    backgroundColor: C.white,
    borderTopWidth: 1, borderTopColor: C.sep,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  tabItem:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
  tabIcon:       { fontSize: 20, marginBottom: 3 },
  tabIconActive: { transform: [{ scale: 1.1 }] },
  tabLabel:      { fontSize: 10, color: C.brownPale, fontWeight: '600' },
  tabLabelActive:{ color: C.brown, fontWeight: '800' },
});
