import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Specialty } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CounselorDetail {
  id: string;
  name: string;
  avatar_emoji: string | null;
  specialty: Specialty[];
  bio: string | null;
  rating: number;
  review_count: number;
  is_available: boolean;
  is_certified: boolean;
  hourly_rate: number;
  available_hours: Record<string, string[]>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  cream: '#faf8f5',
  brown: '#3d2c1e',
  brownLight: '#5a4633',
  brownPale: '#8c7b6b',
  gold: '#f0c98a',
  goldLight: '#f5ddb5',
  white: '#ffffff',
  green: '#4caf50',
} as const;

const DAY_LABELS: Record<string, string> = {
  mon: '월', tue: '화', wed: '수', thu: '목',
  fri: '금', sat: '토', sun: '일',
};
const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// ─── Component ────────────────────────────────────────────────────────────────

export default function CounselorDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [counselor, setCounselor] = useState<CounselorDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchCounselor();
  }, [id]);

  const fetchCounselor = async () => {
    try {
      const { data, error } = await supabase
        .from('counselors')
        .select('*, users(name, avatar_emoji)')
        .eq('id', id)
        .single();

      if (error) throw error;

      setCounselor({
        id: data.id,
        name: (data.users as any)?.name ?? '경청사',
        avatar_emoji: (data.users as any)?.avatar_emoji ?? null,
        specialty: data.specialty as Specialty[],
        bio: data.bio,
        rating: Number(data.rating),
        review_count: data.review_count,
        is_available: data.is_available,
        is_certified: data.is_certified,
        hourly_rate: data.hourly_rate,
        available_hours: (data.available_hours as Record<string, string[]>) ?? {},
      });
    } catch (err) {
      console.error('경청사 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={[s.centered, { backgroundColor: C.cream }]}>
        <ActivityIndicator size="large" color={C.brown} />
      </View>
    );
  }

  if (!counselor) {
    return (
      <View style={[s.centered, { backgroundColor: C.cream }]}>
        <Text style={{ color: C.brownPale, fontSize: 15 }}>경청사를 찾을 수 없어요</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: C.brown, fontWeight: '700' }}>← 돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const availDays = DAY_ORDER.filter(
    (d) => (counselor.available_hours[d] ?? []).length > 0
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 }}>

        {/* ── Profile Header ── */}
        <View style={s.profileHeader}>
          <View style={s.avatarWrap}>
            <Text style={{ fontSize: 52 }}>{counselor.avatar_emoji ?? '🎧'}</Text>
            {counselor.is_available && <View style={s.onlineDot} />}
          </View>

          <View style={{ flex: 1, marginLeft: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={s.nameText}>{counselor.name}</Text>
              {counselor.is_certified && (
                <View style={s.certBadge}>
                  <Text style={s.certText}>인증</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
              {counselor.specialty.map((sp) => (
                <View key={sp} style={s.specialtyChip}>
                  <Text style={s.specialtyText}>{sp}</Text>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={s.ratingText}>★ {counselor.rating.toFixed(1)}</Text>
              <Text style={s.reviewCountText}>  ({counselor.review_count}개 리뷰)</Text>
            </View>
          </View>
        </View>

        {/* ── Availability Status ── */}
        <View style={[s.section, { flexDirection: 'row', alignItems: 'center' }]}>
          <View style={[s.statusDot, { backgroundColor: counselor.is_available ? C.green : '#bdbdbd' }]} />
          <Text style={{ fontSize: 14, color: counselor.is_available ? '#2e7d32' : '#757575', fontWeight: '600' }}>
            {counselor.is_available ? '지금 상담 가능' : '현재 상담 중'}
          </Text>
        </View>

        {/* ── Bio ── */}
        {!!counselor.bio && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>소개</Text>
            <Text style={s.bioText}>{counselor.bio}</Text>
          </View>
        )}

        {/* ── Available Days ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>상담 가능 요일</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {availDays.length > 0
              ? availDays.map((d) => (
                  <View key={d} style={s.dayChip}>
                    <Text style={s.dayChipText}>{DAY_LABELS[d]}</Text>
                  </View>
                ))
              : <Text style={{ fontSize: 13, color: C.brownPale }}>일정 미등록</Text>}
          </View>
        </View>

        {/* ── Time Preview (first available day) ── */}
        {availDays.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>상담 가능 시간 (예시 — {DAY_LABELS[availDays[0]]}요일)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {(counselor.available_hours[availDays[0]] ?? []).map((t) => (
                <View key={t} style={s.timeChip}>
                  <Text style={s.timeChipText}>{t}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Rate ── */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>상담 요금</Text>
          <Text style={s.rateText}>{counselor.hourly_rate.toLocaleString()}원</Text>
          <Text style={s.rateSub}>50분 1회 기준</Text>
        </View>

      </ScrollView>

      {/* ── CTA ── */}
      <View style={s.ctaBar}>
        <View style={s.ctaPrice}>
          <Text style={s.ctaPriceLabel}>50분</Text>
          <Text style={s.ctaPriceValue}>{counselor.hourly_rate.toLocaleString()}원</Text>
        </View>
        <TouchableOpacity
          style={[s.ctaBtn, !counselor.is_available && s.ctaBtnDisabled]}
          disabled={!counselor.is_available}
          onPress={() =>
            router.push({
              pathname: '/(user)/booking',
              params: { counselorId: id },
            } as any)
          }
          activeOpacity={0.85}
        >
          <Text style={s.ctaBtnText}>
            {counselor.is_available ? '예약하기' : '현재 상담 불가'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 24,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ebe3',
  },
  avatarWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#f5efe6',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: C.green,
    borderWidth: 2.5,
    borderColor: C.white,
  },
  nameText: {
    fontSize: 20,
    fontWeight: '800',
    color: C.brown,
    marginRight: 8,
    flexShrink: 1,
  },
  certBadge: {
    backgroundColor: C.goldLight,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  certText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.brown,
  },
  specialtyChip: {
    backgroundColor: '#f5f0e8',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  specialtyText: {
    fontSize: 11,
    color: C.brownLight,
    fontWeight: '600',
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e8a838',
  },
  reviewCountText: {
    fontSize: 12,
    color: C.brownPale,
  },
  section: {
    backgroundColor: C.white,
    marginTop: 8,
    padding: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f0ebe3',
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.brownPale,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  bioText: {
    fontSize: 15,
    color: C.brownLight,
    lineHeight: 24,
  },
  dayChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5efe6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.gold,
  },
  dayChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.brown,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f5f0e8',
  },
  timeChipText: {
    fontSize: 13,
    color: C.brownLight,
    fontWeight: '500',
  },
  rateText: {
    fontSize: 26,
    fontWeight: '900',
    color: C.brown,
    marginTop: 4,
  },
  rateSub: {
    fontSize: 12,
    color: C.brownPale,
    marginTop: 2,
  },
  ctaBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: '#f0ebe3',
    gap: 12,
  },
  ctaPrice: {
    alignItems: 'flex-start',
  },
  ctaPriceLabel: {
    fontSize: 11,
    color: C.brownPale,
    fontWeight: '500',
  },
  ctaPriceValue: {
    fontSize: 18,
    fontWeight: '800',
    color: C.brown,
  },
  ctaBtn: {
    flex: 1,
    backgroundColor: C.brown,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaBtnDisabled: {
    backgroundColor: '#c5b9ae',
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.white,
  },
});
