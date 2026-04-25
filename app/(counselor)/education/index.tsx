import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Course, CounselorCourse } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CourseWithProgress extends Course {
  progress: number;         // 0-100
  isLocked: boolean;
  enrolledAt: string | null;
  completedAt: string | null;
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
  greenBg: '#e8f5e9',
  greenText: '#2e7d32',
  redBg: '#fff3f3',
} as const;

function getStatusMeta(progress: number, isLocked: boolean) {
  if (isLocked)      return { label: '잠김', color: '#bdbdbd', bg: '#f5f5f5', icon: '🔒' };
  if (progress === 100) return { label: '완료', color: C.greenText, bg: C.greenBg, icon: '✓' };
  if (progress > 0)  return { label: '진행 중', color: '#e8a838', bg: '#fff8e1', icon: '▶' };
  return              { label: '미시작', color: C.brownPale, bg: '#f5f0e8', icon: '○' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EducationListScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [required, setRequired]   = useState<CourseWithProgress[]>([]);
  const [optional, setOptional]   = useState<CourseWithProgress[]>([]);
  const [isCertified, setIsCertified] = useState(false);
  const [certProgress, setCertProgress] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      // 1. 전체 강의 목록
      const [coursesRes, progressRes, counselorRes] = await Promise.all([
        supabase.from('courses').select('*').order('is_required', { ascending: false }).order('order_index'),
        supabase.from('counselor_courses').select('*').eq('counselor_id', user.id),
        supabase.from('counselors').select('is_certified').eq('id', user.id).single(),
      ]);

      const courses = (coursesRes.data ?? []) as Course[];
      const progressMap = ((progressRes.data ?? []) as CounselorCourse[]).reduce<Record<string, CounselorCourse>>(
        (acc, p) => { acc[p.course_id] = p; return acc; }, {}
      );

      setIsCertified(counselorRes.data?.is_certified ?? false);

      // 2. 잠금 계산 — 이전 필수 과정이 미완료면 잠김
      const requiredCourses = courses.filter(c => c.is_required).sort((a, b) => a.order_index - b.order_index);
      const toDisplay = (list: Course[]): CourseWithProgress[] =>
        list.map((c, idx) => {
          const p = progressMap[c.id];
          const prog = p?.progress ?? 0;
          // 필수 과정: 이전 필수 과정 미완료 시 잠금
          const isLocked = c.is_required
            ? requiredCourses.slice(0, requiredCourses.findIndex(r => r.id === c.id))
                .some(prev => (progressMap[prev.id]?.progress ?? 0) < 100)
            : false;
          return {
            ...c,
            progress: prog,
            isLocked,
            enrolledAt: p?.created_at ?? null,
            completedAt: p?.completed_at ?? null,
          };
        });

      const req = toDisplay(requiredCourses);
      const opt = toDisplay(courses.filter(c => !c.is_required).sort((a, b) => a.order_index - b.order_index));

      setRequired(req);
      setOptional(opt);

      // 3. 인증 진행률
      const completed = req.filter(c => c.progress === 100).length;
      setCertProgress(req.length > 0 ? Math.floor((completed / req.length) * 100) : 0);
    } catch (err) {
      console.error('교육 데이터 조회 실패:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  if (loading) {
    return (
      <View style={[s.fill, s.centered, { backgroundColor: C.cream }]}>
        <ActivityIndicator size="large" color={C.brown} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.cream }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brown} />}
    >
      {/* ── 인증 상태 배너 ── */}
      <View style={isCertified ? s.certBannerDone : s.certBannerProgress}>
        {isCertified ? (
          <View style={s.certRow}>
            <Text style={{ fontSize: 28, marginRight: 14 }}>🏅</Text>
            <View>
              <Text style={s.certDoneTitle}>인증 경청사</Text>
              <Text style={s.certDoneSub}>모든 필수 과정을 이수했어요</Text>
            </View>
          </View>
        ) : (
          <>
            <View style={s.certRow}>
              <Text style={{ fontSize: 28, marginRight: 14 }}>📚</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.certProgressTitle}>인증까지 {100 - certProgress}% 남았어요</Text>
                <Text style={s.certProgressSub}>필수 과정을 모두 이수하면 인증 뱃지를 받아요</Text>
              </View>
            </View>
            <View style={s.certProgressTrack}>
              <View style={[s.certProgressFill, { width: `${certProgress}%` as any }]} />
            </View>
            <Text style={s.certPct}>{certProgress}%</Text>
          </>
        )}
      </View>

      {/* ── 필수 과정 ── */}
      <SectionHeader title="필수 과정" subtitle="인증을 위해 모두 이수해야 해요" icon="📋" />
      <View style={s.section}>
        {required.length === 0 ? (
          <EmptyState message="등록된 필수 과정이 없어요" />
        ) : (
          required.map((course, idx) => (
            <CourseCard
              key={course.id}
              course={course}
              index={idx + 1}
              onPress={() => {
                if (!course.isLocked) {
                  router.push({ pathname: '/(counselor)/education/[courseId]', params: { courseId: course.id } });
                }
              }}
            />
          ))
        )}
      </View>

      {/* ── 선택 과정 ── */}
      {optional.length > 0 && (
        <>
          <SectionHeader title="선택 과정" subtitle="추가로 역량을 키울 수 있어요" icon="✨" />
          <View style={s.section}>
            {optional.map((course, idx) => (
              <CourseCard
                key={course.id}
                course={course}
                index={idx + 1}
                onPress={() =>
                  router.push({ pathname: '/(counselor)/education/[courseId]', params: { courseId: course.id } })
                }
              />
            ))}
          </View>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, icon }: { title: string; subtitle: string; icon: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={{ fontSize: 18, marginRight: 8 }}>{icon}</Text>
      <View>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionSub}>{subtitle}</Text>
      </View>
    </View>
  );
}

function CourseCard({ course, index, onPress }: { course: CourseWithProgress; index: number; onPress: () => void }) {
  const meta = getStatusMeta(course.progress, course.isLocked);

  return (
    <TouchableOpacity
      style={[s.card, course.isLocked && s.cardLocked]}
      onPress={onPress}
      activeOpacity={course.isLocked ? 1 : 0.82}
    >
      {/* Index badge */}
      <View style={[s.indexBadge, course.progress === 100 && s.indexBadgeDone]}>
        <Text style={[s.indexText, course.progress === 100 && { color: C.white }]}>
          {String(index).padStart(2, '0')}
        </Text>
      </View>

      <View style={{ flex: 1, marginLeft: 14 }}>
        {/* Title row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={[s.courseTitle, course.isLocked && { color: '#bdbdbd' }]} numberOfLines={1}>
            {course.title}
          </Text>
          {course.is_required && !course.isLocked && (
            <View style={s.requiredChip}>
              <Text style={s.requiredChipText}>필수</Text>
            </View>
          )}
        </View>

        {/* Description */}
        {!!course.description && (
          <Text style={[s.courseDesc, course.isLocked && { color: '#c5b9ae' }]} numberOfLines={2}>
            {course.description}
          </Text>
        )}

        {/* Duration + Status */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 }}>
          <Text style={s.durationText}>⏱ {course.duration_minutes}분</Text>
          <View style={{ flex: 1 }} />
          <View style={[s.statusBadge, { backgroundColor: meta.bg }]}>
            <Text style={{ fontSize: 10, marginRight: 3 }}>{meta.icon}</Text>
            <Text style={[s.statusText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>

        {/* Progress bar */}
        {!course.isLocked && course.progress > 0 && (
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${course.progress}%` as any }]} />
          </View>
        )}
        {!course.isLocked && course.progress > 0 && (
          <Text style={s.progressPct}>{course.progress}% 완료</Text>
        )}
      </View>

      {/* Arrow */}
      {!course.isLocked && (
        <Text style={{ fontSize: 16, color: '#c5b9ae', marginLeft: 8, alignSelf: 'center' }}>›</Text>
      )}
    </TouchableOpacity>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={s.empty}>
      <Text style={{ fontSize: 28, marginBottom: 8 }}>📂</Text>
      <Text style={{ fontSize: 14, color: C.brownPale }}>{message}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  fill: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },

  // Certification banner
  certBannerDone: {
    margin: 16,
    padding: 20,
    backgroundColor: C.greenBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.25)',
  },
  certBannerProgress: {
    margin: 16,
    padding: 20,
    backgroundColor: '#fff8ec',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(240,201,138,0.4)',
  },
  certRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  certDoneTitle: { fontSize: 17, fontWeight: '800', color: C.greenText, marginBottom: 3 },
  certDoneSub: { fontSize: 12, color: '#388e3c' },
  certProgressTitle: { fontSize: 15, fontWeight: '700', color: C.brown, marginBottom: 3 },
  certProgressSub: { fontSize: 12, color: C.brownPale, lineHeight: 18 },
  certProgressTrack: { height: 6, backgroundColor: '#f5ddb5', borderRadius: 3, marginTop: 12, overflow: 'hidden' },
  certProgressFill: { height: '100%', backgroundColor: C.gold, borderRadius: 3 },
  certPct: { fontSize: 11, color: C.brownPale, textAlign: 'right', marginTop: 4 },

  // Sections
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.brown },
  sectionSub: { fontSize: 12, color: C.brownPale, marginTop: 1 },
  section: { paddingHorizontal: 16, gap: 10, marginBottom: 8 },

  // Course card
  card: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: C.brown,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    alignItems: 'flex-start',
  },
  cardLocked: { opacity: 0.55 },
  indexBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f5f0e8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  indexBadgeDone: { backgroundColor: C.green },
  indexText: { fontSize: 13, fontWeight: '800', color: C.brownLight },
  courseTitle: { fontSize: 15, fontWeight: '700', color: C.brown, flex: 1, marginRight: 6 },
  requiredChip: { backgroundColor: '#fff3e0', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  requiredChipText: { fontSize: 9, fontWeight: '700', color: '#e65100' },
  courseDesc: { fontSize: 12, color: C.brownPale, lineHeight: 18 },
  durationText: { fontSize: 11, color: C.brownPale },
  statusBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  progressTrack: { height: 4, backgroundColor: '#f0ebe3', borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: C.gold, borderRadius: 2 },
  progressPct: { fontSize: 10, color: C.brownPale, marginTop: 3, textAlign: 'right' },

  empty: { alignItems: 'center', paddingVertical: 32 },
});
