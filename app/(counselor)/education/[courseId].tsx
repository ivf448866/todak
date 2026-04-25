import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  LayoutChangeEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Course } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

type ViewerTab = 'overview' | 'chapters';

interface Chapter {
  id: number;
  title: string;
  startMs: number;
  durationMs: number;
  label: string;  // "00:00"
}

interface LoadedStatus {
  isLoaded: true;
  positionMillis: number;
  durationMillis: number | undefined;
  isPlaying: boolean;
  isBuffering: boolean;
  didJustFinish: boolean;
  playableDurationMillis?: number;
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
  black: '#000000',
  green: '#4caf50',
  greenBg: '#e8f5e9',
  greenText: '#2e7d32',
  playerBg: '#0d0a07',
} as const;

const COMPLETION_THRESHOLD = 80; // %
const SAVE_INTERVAL_MS = 10_000; // 10초

// ─── Helpers ─────────────────────────────────────────────────────────────────

function msToLabel(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function generateChapters(durationMin: number): Chapter[] {
  const CHAPTER_SIZE_MIN = 10;
  const count = Math.max(1, Math.ceil(durationMin / CHAPTER_SIZE_MIN));
  const totalMs = durationMin * 60 * 1000;
  return Array.from({ length: count }, (_, i) => {
    const startMs = i * CHAPTER_SIZE_MIN * 60 * 1000;
    const endMs = Math.min((i + 1) * CHAPTER_SIZE_MIN * 60 * 1000, totalMs);
    return {
      id: i,
      title: `챕터 ${i + 1}`,
      startMs,
      durationMs: endMs - startMs,
      label: msToLabel(startMs),
    };
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CourseViewerScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [course, setCourse] = useState<Course | null>(null);
  const [initialProgress, setInitialProgress] = useState(0);
  const [loading, setLoading] = useState(true);

  // ── Player state ──────────────────────────────────────────────────────────
  const videoRef = useRef<Video>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [maxWatched, setMaxWatched] = useState(0);  // highest % reached

  // ── UI ────────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<ViewerTab>('overview');
  const [completing, setCompleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedProgress = useRef(-1);

  // ── Fetch course + current progress ──────────────────────────────────────
  useEffect(() => {
    if (!courseId || !user?.id) return;
    (async () => {
      try {
        const [courseRes, progressRes] = await Promise.all([
          supabase.from('courses').select('*').eq('id', courseId).single(),
          supabase.from('counselor_courses').select('*')
            .eq('counselor_id', user.id).eq('course_id', courseId).maybeSingle(),
        ]);

        if (courseRes.error) throw courseRes.error;
        setCourse(courseRes.data as Course);

        const prog = progressRes.data?.progress ?? 0;
        setInitialProgress(prog);
        setMaxWatched(prog);
        if (prog >= COMPLETION_THRESHOLD) setCompleted(true);
      } catch (err) {
        console.error('강의 조회 실패:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId, user?.id]);

  // ── Auto-seek to saved position on load ───────────────────────────────────
  useEffect(() => {
    if (!course || initialProgress === 0 || duration === 0) return;
    const resumeMs = (initialProgress / 100) * duration;
    if (resumeMs > 10_000) {
      videoRef.current?.setPositionAsync(resumeMs).catch(() => null);
    }
  }, [duration, initialProgress, course]);

  // ── Progress save loop ────────────────────────────────────────────────────
  const saveProgress = useCallback(async (posMs: number, durMs: number) => {
    if (!user?.id || !courseId || durMs === 0) return;
    const pct = Math.min(100, Math.floor((posMs / durMs) * 100));
    if (pct === lastSavedProgress.current) return;
    lastSavedProgress.current = pct;

    const isComplete = pct >= COMPLETION_THRESHOLD;
    await supabase
      .from('counselor_courses')
      .upsert(
        {
          counselor_id: user.id,
          course_id: courseId,
          progress: pct,
          completed_at: pct === 100 ? new Date().toISOString() : null,
        },
        { onConflict: 'counselor_id,course_id' }
      )
      .catch(console.error);

    if (isComplete) setCompleted(true);
  }, [user?.id, courseId]);

  useEffect(() => {
    if (!isPlaying) {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
      return;
    }
    saveTimerRef.current = setInterval(() => {
      if (duration > 0) saveProgress(position, duration);
    }, SAVE_INTERVAL_MS);

    return () => { if (saveTimerRef.current) clearInterval(saveTimerRef.current); };
  }, [isPlaying, position, duration, saveProgress]);

  // ── Playback status handler ───────────────────────────────────────────────
  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    const s = status as LoadedStatus;

    setPosition(s.positionMillis);
    setDuration(s.durationMillis ?? 0);
    setIsPlaying(s.isPlaying);
    setIsBuffering(s.isBuffering);

    if (s.durationMillis && s.durationMillis > 0) {
      const pct = (s.positionMillis / s.durationMillis) * 100;
      setMaxWatched(prev => Math.max(prev, pct));
    }

    if (s.didJustFinish) {
      saveProgress(s.durationMillis ?? 0, s.durationMillis ?? 1);
      setMaxWatched(100);
      setCompleted(true);
    }
  }, [saveProgress]);

  // ── Toggle play ───────────────────────────────────────────────────────────
  const togglePlay = async () => {
    if (!videoRef.current) return;
    if (isPlaying) await videoRef.current.pauseAsync();
    else await videoRef.current.playAsync();
  };

  // ── Seek via progress bar tap ─────────────────────────────────────────────
  const onProgressBarPress = (e: { nativeEvent: { locationX: number } }) => {
    if (!progressBarWidth || !duration) return;
    const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / progressBarWidth));
    const targetMs = ratio * duration;
    videoRef.current?.setPositionAsync(targetMs).catch(() => null);
    setPosition(targetMs);
  };

  // ── Chapter seek ──────────────────────────────────────────────────────────
  const seekToChapter = (chapter: Chapter) => {
    videoRef.current?.setPositionAsync(chapter.startMs).catch(() => null);
    setPosition(chapter.startMs);
  };

  // ── Manual complete ───────────────────────────────────────────────────────
  const handleComplete = async () => {
    if (!user?.id || !courseId) return;
    // UI disabled 우회 방어 — 버튼 외 직접 호출 대비
    if (maxWatched < COMPLETION_THRESHOLD) return;
    setCompleting(true);
    try {
      await supabase
        .from('counselor_courses')
        .upsert(
          { counselor_id: user.id, course_id: courseId, progress: 100, completed_at: new Date().toISOString() },
          { onConflict: 'counselor_id,course_id' }
        );
      Alert.alert('🎉 이수 완료!', `"${course?.title}" 강의를 완료했어요.`, [
        { text: '확인', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('오류', err.message ?? '이수 처리 실패');
    } finally {
      setCompleting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[s.fill, s.centered, { backgroundColor: C.cream }]}>
        <ActivityIndicator size="large" color={C.brown} />
      </View>
    );
  }

  if (!course) {
    return (
      <View style={[s.fill, s.centered, { backgroundColor: C.cream }]}>
        <Text style={{ color: C.brownPale }}>강의를 찾을 수 없어요</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: C.brown, fontWeight: '700' }}>← 돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const chapters = generateChapters(course.duration_minutes);
  const progressPct = duration > 0 ? (position / duration) * 100 : 0;
  const canComplete = maxWatched >= COMPLETION_THRESHOLD;
  const currentChapterIdx = chapters.findLastIndex(c => position >= c.startMs);

  return (
    <View style={{ flex: 1, backgroundColor: C.black }}>

      {/* ── Video Player ── */}
      <View style={s.playerContainer}>
        {course.video_url ? (
          <>
            <Video
              ref={videoRef}
              source={{ uri: course.video_url }}
              style={s.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              progressUpdateIntervalMillis={500}
              onPlaybackStatusUpdate={onPlaybackStatusUpdate}
            />

            {/* Buffering overlay */}
            {isBuffering && (
              <View style={s.bufferingOverlay}>
                <ActivityIndicator size="large" color={C.gold} />
              </View>
            )}

            {/* Play/Pause tap area */}
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              onPress={togglePlay}
              activeOpacity={1}
            >
              {!isPlaying && (
                <View style={s.playOverlay}>
                  <View style={s.playBtn}>
                    <Text style={{ fontSize: 28, color: C.white, marginLeft: 4 }}>▶</Text>
                  </View>
                </View>
              )}
            </TouchableOpacity>

            {/* Controls bar */}
            <View style={s.controls}>
              <Text style={s.timeText}>
                {msToLabel(position)} / {msToLabel(duration)}
              </Text>

              {/* Seek bar */}
              <TouchableOpacity
                style={s.seekBar}
                onPress={onProgressBarPress}
                onLayout={(e: LayoutChangeEvent) => setProgressBarWidth(e.nativeEvent.layout.width)}
                activeOpacity={1}
              >
                {/* Played (gold) */}
                <View style={[s.seekFill, { width: `${progressPct}%` as any }]} />
                {/* Max watched (lighter) */}
                <View style={[s.seekMax, { width: `${maxWatched}%` as any }]} />
                {/* Thumb */}
                <View style={[s.seekThumb, { left: `${progressPct}%` as any }]} />
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={[s.video, s.centered]}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>🎬</Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
              영상 URL이 없어요
            </Text>
          </View>
        )}
      </View>

      {/* ── Content Area ── */}
      <View style={{ flex: 1, backgroundColor: C.cream }}>

        {/* Watched progress */}
        <View style={s.watchedBar}>
          <View style={[s.watchedFill, { width: `${Math.min(100, maxWatched)}%` as any }]} />
        </View>
        <Text style={s.watchedPct}>{Math.floor(maxWatched)}% 시청</Text>

        {/* Tabs */}
        <View style={s.tabRow}>
          {(['overview', 'chapters'] as ViewerTab[]).map((t) => (
            <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'overview' ? '개요' : `챕터 (${chapters.length})`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {tab === 'overview' ? (
            <View style={s.overview}>
              <Text style={s.courseTitle}>{course.title}</Text>
              {course.is_required && (
                <View style={s.requiredChip}>
                  <Text style={s.requiredChipText}>필수 과정</Text>
                </View>
              )}
              <View style={s.metaRow}>
                <View style={s.metaChip}><Text style={s.metaText}>⏱ {course.duration_minutes}분</Text></View>
                {completed && <View style={[s.metaChip, { backgroundColor: C.greenBg }]}>
                  <Text style={[s.metaText, { color: C.greenText }]}>✓ 이수 완료</Text>
                </View>}
              </View>
              {!!course.description && (
                <Text style={s.descText}>{course.description}</Text>
              )}
              {!canComplete && (
                <View style={s.thresholdNote}>
                  <Text style={s.thresholdNoteText}>
                    완료 버튼은 {COMPLETION_THRESHOLD}% 이상 시청 후 활성화돼요
                    ({Math.floor(maxWatched)}% 시청 중)
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View style={{ padding: 16 }}>
              {chapters.map((ch, i) => {
                const isActive = i === currentChapterIdx;
                return (
                  <TouchableOpacity
                    key={ch.id}
                    style={[s.chapterRow, isActive && s.chapterRowActive]}
                    onPress={() => seekToChapter(ch)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.chapterNum, isActive && s.chapterNumActive]}>
                      {isActive
                        ? <Text style={{ fontSize: 10, color: C.white }}>▶</Text>
                        : <Text style={s.chapterNumText}>{i + 1}</Text>
                      }
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={[s.chapterTitle, isActive && { color: C.brown, fontWeight: '700' }]}>
                        {ch.title}
                      </Text>
                      <Text style={s.chapterMeta}>
                        {ch.label}  ·  {Math.floor(ch.durationMs / 60000)}분
                      </Text>
                    </View>
                    {position >= ch.startMs && position < (ch.startMs + ch.durationMs) && (
                      <View style={s.playingDot} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* ── Complete Button ── */}
        <View style={s.completeBtnBar}>
          {completed ? (
            <View style={s.completedBanner}>
              <Text style={{ fontSize: 16, marginRight: 8 }}>✓</Text>
              <Text style={s.completedBannerText}>이수 완료된 강의예요</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.completeBtn, !canComplete && s.completeBtnDisabled]}
              disabled={!canComplete || completing}
              onPress={handleComplete}
              activeOpacity={0.85}
            >
              {completing ? (
                <ActivityIndicator size="small" color={C.brown} />
              ) : (
                <Text style={[s.completeBtnText, !canComplete && { color: '#bdbdbd' }]}>
                  {canComplete ? '이수 완료하기 ✓' : `${COMPLETION_THRESHOLD}% 이상 시청 필요`}
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  fill: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },

  // Player
  playerContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: C.playerBg,
    position: 'relative',
  },
  video: { width: '100%', aspectRatio: 16 / 9 },
  bufferingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(240,201,138,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingBottom: 10,
    paddingTop: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  timeText: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginBottom: 6 },
  seekBar: {
    height: 20,
    justifyContent: 'center',
    position: 'relative',
  },
  seekFill: {
    height: 4,
    backgroundColor: C.gold,
    borderRadius: 2,
    position: 'absolute',
    top: 8,
    left: 0,
    zIndex: 2,
  },
  seekMax: {
    height: 4,
    backgroundColor: 'rgba(240,201,138,0.35)',
    borderRadius: 2,
    position: 'absolute',
    top: 8,
    left: 0,
    zIndex: 1,
  },
  seekThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.gold,
    position: 'absolute',
    top: 3,
    marginLeft: -7,
    zIndex: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },

  // Watched bar
  watchedBar: { height: 3, backgroundColor: '#f0ebe3', overflow: 'hidden' },
  watchedFill: { height: '100%', backgroundColor: C.gold },
  watchedPct: { fontSize: 10, color: C.brownPale, textAlign: 'right', paddingRight: 14, paddingTop: 3 },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0ebe3',
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 12,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: C.brown },
  tabText: { fontSize: 13, color: C.brownPale, fontWeight: '600' },
  tabTextActive: { color: C.brown },

  // Overview
  overview: { padding: 20 },
  courseTitle: { fontSize: 18, fontWeight: '800', color: C.brown, marginBottom: 8 },
  requiredChip: { alignSelf: 'flex-start', backgroundColor: '#fff3e0', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 12 },
  requiredChipText: { fontSize: 10, fontWeight: '700', color: '#e65100' },
  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metaChip: { backgroundColor: '#f5f0e8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  metaText: { fontSize: 12, color: C.brownLight, fontWeight: '500' },
  descText: { fontSize: 14, color: C.brownLight, lineHeight: 24 },
  thresholdNote: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fff8ec',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(240,201,138,0.4)',
  },
  thresholdNoteText: { fontSize: 12, color: '#8c6d1f', lineHeight: 18 },

  // Chapters
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 10,
    marginBottom: 4,
  },
  chapterRowActive: { backgroundColor: '#fff8ec' },
  chapterNum: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#f5f0e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterNumActive: { backgroundColor: C.brown },
  chapterNumText: { fontSize: 11, fontWeight: '700', color: C.brownLight },
  chapterTitle: { fontSize: 14, color: C.brownLight, fontWeight: '500' },
  chapterMeta: { fontSize: 11, color: C.brownPale, marginTop: 2 },
  playingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green, marginLeft: 8 },

  // Complete button
  completeBtnBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: C.cream,
    borderTopWidth: 1,
    borderTopColor: '#f0ebe3',
  },
  completeBtn: {
    backgroundColor: C.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  completeBtnDisabled: { backgroundColor: '#f0ebe3' },
  completeBtnText: { fontSize: 15, fontWeight: '700', color: C.brown },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.greenBg,
    borderRadius: 14,
    paddingVertical: 14,
  },
  completedBannerText: { fontSize: 15, fontWeight: '700', color: C.greenText },
});
