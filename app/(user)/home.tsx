import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Animated,
  StatusBar,
  StyleSheet,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Specialty, CounselorListItem } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type CategoryFilter = '전체' | Specialty;

// Supabase join 결과 타입 (내부 매핑용)
type CounselorRow = {
  id: string;
  specialty: string[];
  bio: string | null;
  rating: number;
  review_count: number;
  is_available: boolean;
  is_certified: boolean;
  users: { name: string; avatar_emoji: string | null } | null;
};

interface TabItem {
  id: string;
  icon: string;
  label: string;
  route: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  cream: '#faf8f5',
  brown: '#3d2c1e',
  brownMid: '#4e3828',
  brownLight: '#5a4633',
  brownPale: '#8c7b6b',
  gold: '#f0c98a',
  goldLight: '#f5ddb5',
  white: '#ffffff',
  green: '#4caf50',
  greenBg: '#e8f5e9',
  greenText: '#2e7d32',
} as const;

const CATEGORIES: CategoryFilter[] = ['전체', '직장', '연애', '가족', '진로'];

const TABS: TabItem[] = [
  { id: 'home', icon: '🏠', label: '홈', route: '/(user)/home' },
  { id: 'booking', icon: '📅', label: '예약내역', route: '/(user)/booking' },
  { id: 'chat', icon: '💬', label: '채팅', route: '/(user)/chat' },
  { id: 'mypage', icon: '👤', label: '마이페이지', route: '/(user)/mypage' },
];

const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 82 : 66;

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonBox({
  width,
  height,
  radius = 8,
  style,
}: {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 750,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View
      style={[
        { width, height, backgroundColor: '#ddd3c5', borderRadius: radius, opacity },
        style,
      ]}
    />
  );
}

function CounselorSkeleton() {
  return (
    <View style={s.card}>
      <SkeletonBox width={64} height={64} radius={32} />
      <View style={{ flex: 1, marginLeft: 14, gap: 8 }}>
        <SkeletonBox width="55%" height={15} />
        <SkeletonBox width="40%" height={11} />
        <SkeletonBox width="80%" height={11} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <SkeletonBox width="35%" height={11} />
          <SkeletonBox width="28%" height={22} radius={12} />
        </View>
      </View>
    </View>
  );
}

// ─── Counselor Card ───────────────────────────────────────────────────────────

function CounselorCard({
  item,
  onPress,
}: {
  item: CounselorListItem;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.82}>
      {/* Avatar + Online dot */}
      <View style={s.avatarWrap}>
        <View style={s.avatarCircle}>
          <Text style={{ fontSize: 30 }}>{item.avatar_emoji ?? '🎧'}</Text>
        </View>
        {item.is_available && <View style={s.onlineDot} />}
      </View>

      {/* Content */}
      <View style={{ flex: 1, marginLeft: 14 }}>
        {/* Name + 인증 뱃지 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
          <Text style={s.counselorName} numberOfLines={1}>
            {item.name}
          </Text>
          {item.is_certified && (
            <View style={s.certBadge}>
              <Text style={s.certText}>인증</Text>
            </View>
          )}
        </View>

        {/* 전문분야 칩 */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
          {item.specialty.map((sp) => (
            <View key={sp} style={s.specialtyChip}>
              <Text style={s.specialtyText}>{sp}</Text>
            </View>
          ))}
        </View>

        {/* 한줄소개 */}
        {!!item.bio && (
          <Text style={s.bioText} numberOfLines={1}>
            {item.bio}
          </Text>
        )}

        {/* 평점 + 리뷰 + 가용 뱃지 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
          <Text style={s.ratingText}>★ {item.rating.toFixed(1)}</Text>
          <Text style={s.reviewText}>리뷰 {item.review_count}개</Text>
          <View style={{ flex: 1 }} />
          <View
            style={[
              s.availBadge,
              { backgroundColor: item.is_available ? C.greenBg : '#f0ede9' },
            ]}
          >
            <View
              style={[
                s.availDot,
                { backgroundColor: item.is_available ? C.green : '#bdbdbd' },
              ]}
            />
            <Text
              style={[
                s.availText,
                { color: item.is_available ? C.greenText : '#757575' },
              ]}
            >
              {item.is_available ? '지금 가능' : '상담 중'}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function UserHomeScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [counselors, setCounselors] = useState<CounselorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('전체');
  const [onlineCount, setOnlineCount] = useState(0);

  const fetchCounselors = useCallback(async (category: CategoryFilter) => {
    try {
      setLoading(true);

      let query = supabase
        .from('counselors')
        .select(
          'id, specialty, bio, rating, review_count, is_available, is_certified, users(name, avatar_emoji)'
        )
        .order('is_available', { ascending: false })
        .order('rating', { ascending: false });

      if (category !== '전체') {
        query = query.contains('specialty', [category]);
      }

      const { data, error } = await query;
      if (error) throw error;

      const items: CounselorListItem[] = ((data ?? []) as CounselorRow[]).map((row) => ({
        id: row.id,
        name: row.users?.name ?? '경청사',
        avatar_emoji: row.users?.avatar_emoji ?? null,
        specialty: row.specialty as Specialty[],
        bio: row.bio,
        rating: Number(row.rating),
        review_count: row.review_count,
        is_available: row.is_available,
        is_certified: row.is_certified,
      }));

      setCounselors(items);
      setOnlineCount(items.filter((c) => c.is_available).length);
    } catch (err) {
      console.error('경청사 목록 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounselors(selectedCategory);
  }, [selectedCategory, fetchCounselors]);

  // 실시간 구독
  useEffect(() => {
    const channel = supabase
      .channel('home-counselors')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'counselors' },
        () => fetchCounselors(selectedCategory)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCounselors, selectedCategory]);

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <StatusBar barStyle="dark-content" backgroundColor={C.cream} />

      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.logoText}>토닥</Text>
          <Text style={s.tagline}>귀 기울여 드려요</Text>
        </View>
        <TouchableOpacity style={s.bellBtn} activeOpacity={0.7}>
          <Text style={{ fontSize: 22 }}>🔔</Text>
        </TouchableOpacity>
      </View>

      {/* ── Scroll Content ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Card ── */}
        <View style={s.heroCard}>
          {/* 장식 원 */}
          <View style={s.heroCircleLg} />
          <View style={s.heroCircleSm} />

          {/* 온라인 뱃지 */}
          <View style={s.onlineBadge}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.green, marginRight: 5 }} />
            <Text style={s.onlineBadgeText}>경청사 {onlineCount}명 온라인</Text>
          </View>

          <Text style={s.heroTitle}>오늘 마음이{'\n'}좀 어떠세요?</Text>
          <Text style={s.heroSub}>판단 없이 들어드릴게요</Text>

          <TouchableOpacity
            style={s.heroCta}
            activeOpacity={0.85}
            onPress={() => router.push('/(user)/booking' as any)}
          >
            <Text style={s.heroCtaText}>지금 바로 시작하기  →</Text>
          </TouchableOpacity>
        </View>

        {/* ── Category Filter ── */}
        <View style={{ marginTop: 24 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
          >
            {CATEGORIES.map((cat) => {
              const active = selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  style={[s.catChip, active && s.catChipActive]}
                  activeOpacity={0.75}
                >
                  <Text style={[s.catText, active && s.catTextActive]}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Section Header ── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>
            {selectedCategory === '전체' ? '모든 경청사' : `${selectedCategory} 전문`}
          </Text>
          {!loading && (
            <Text style={s.sectionCount}>{counselors.length}명</Text>
          )}
        </View>

        {/* ── Counselor List ── */}
        <View style={{ paddingHorizontal: 20 }}>
          {loading ? (
            <>
              <CounselorSkeleton />
              <View style={{ height: 12 }} />
              <CounselorSkeleton />
              <View style={{ height: 12 }} />
              <CounselorSkeleton />
            </>
          ) : counselors.length === 0 ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 36, marginBottom: 12 }}>🎧</Text>
              <Text style={s.emptyTitle}>경청사가 없어요</Text>
              <Text style={s.emptyDesc}>다른 카테고리를 선택해보세요</Text>
            </View>
          ) : (
            <FlatList
              data={counselors}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <CounselorCard
                  item={item}
                  onPress={() => router.push(`/counselor/${item.id}` as any)}
                />
              )}
              ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
            />
          )}
        </View>
      </ScrollView>

      {/* ── Bottom Tab Bar ── */}
      <View style={s.tabBar}>
        {TABS.map((tab) => {
          const active = tab.id === 'home';
          return (
            <TouchableOpacity
              key={tab.id}
              style={s.tabItem}
              onPress={() => {
                if (!active) router.push(tab.route as any);
              }}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 20,
    paddingBottom: 16,
    backgroundColor: C.cream,
  },
  logoText: {
    fontSize: 22,
    fontWeight: '900',
    color: C.brown,
    letterSpacing: 3,
  },
  tagline: {
    fontSize: 11,
    color: C.brownPale,
    marginTop: 1,
    letterSpacing: 0.5,
  },
  bellBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f0ebe3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Hero Card
  heroCard: {
    marginHorizontal: 20,
    borderRadius: 20,
    backgroundColor: C.brown,
    padding: 24,
    overflow: 'hidden',
    minHeight: 200,
  },
  heroCircleLg: {
    position: 'absolute',
    top: -48,
    right: -48,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: C.brownMid,
    opacity: 0.7,
  },
  heroCircleSm: {
    position: 'absolute',
    bottom: -30,
    left: 100,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2a1d12',
    opacity: 0.5,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 14,
  },
  onlineBadgeText: {
    fontSize: 12,
    color: C.white,
    fontWeight: '600',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: C.white,
    lineHeight: 34,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 14,
    color: C.goldLight,
    marginBottom: 20,
  },
  heroCta: {
    alignSelf: 'flex-start',
    backgroundColor: C.gold,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  heroCtaText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.brown,
  },

  // Category Filter
  catChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ede9e2',
  },
  catChipActive: {
    backgroundColor: C.brown,
  },
  catText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.brownPale,
  },
  catTextActive: {
    color: C.white,
  },

  // Section header
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.brown,
  },
  sectionCount: {
    fontSize: 13,
    color: C.brownPale,
    marginLeft: 6,
  },

  // Counselor Card
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: C.brown,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f5efe6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: C.green,
    borderWidth: 2,
    borderColor: C.white,
  },
  counselorName: {
    fontSize: 15,
    fontWeight: '700',
    color: C.brown,
    flexShrink: 1,
    marginRight: 6,
  },
  certBadge: {
    backgroundColor: C.goldLight,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  certText: {
    fontSize: 9,
    fontWeight: '700',
    color: C.brown,
  },
  specialtyChip: {
    backgroundColor: '#f5f0e8',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  specialtyText: {
    fontSize: 10,
    color: C.brownLight,
    fontWeight: '500',
  },
  bioText: {
    fontSize: 12,
    color: C.brownPale,
    lineHeight: 17,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e8a838',
  },
  reviewText: {
    fontSize: 12,
    color: C.brownPale,
    marginLeft: 5,
  },
  availBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  availDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  availText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Empty State
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.brownLight,
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 13,
    color: C.brownPale,
  },

  // Bottom Tab Bar
  tabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: TAB_BAR_HEIGHT,
    flexDirection: 'row',
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: '#ede9e2',
    paddingBottom: Platform.OS === 'ios' ? 16 : 0,
    shadowColor: C.brown,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
  },
  tabIcon: {
    fontSize: 20,
    opacity: 0.4,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 3,
    color: C.brownPale,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: C.brown,
    fontWeight: '700',
  },
});
