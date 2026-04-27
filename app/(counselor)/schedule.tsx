import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Switch, Platform, Modal,
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { useAuthStore } from '@/stores/authStore';
import {
  getCounselorDetail,
  getCounselorBookings,
  updateCounselorProfile,
} from '@/lib/supabase';
import { Counselor } from '@/types';

// ─── Korean locale ────────────────────────────────────────────────────────────

LocaleConfig.locales['ko'] = {
  monthNames: ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'],
  monthNamesShort: ['1','2','3','4','5','6','7','8','9','10','11','12'],
  dayNames: ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'],
  dayNamesShort: ['일','월','화','수','목','금','토'],
  today: '오늘',
};
LocaleConfig.defaultLocale = 'ko';

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  cream:      '#faf8f5',
  brown:      '#3d2c1e',
  brownLight: '#5a4633',
  brownPale:  '#8c7b6b',
  gold:       '#f0c98a',
  goldLight:  '#f5ddb5',
  goldBg:     '#fffbf3',
  white:      '#ffffff',
  sep:        '#f0ebe3',
  green:      '#16a34a',
  greenBg:    '#dcfce7',
  red:        '#ef4444',
  redBg:      '#fee2e2',
} as const;

const DAYS = [
  { key: 'mon', label: '월', short: '월' },
  { key: 'tue', label: '화', short: '화' },
  { key: 'wed', label: '수', short: '수' },
  { key: 'thu', label: '목', short: '목' },
  { key: 'fri', label: '금', short: '금' },
  { key: 'sat', label: '토', short: '토' },
  { key: 'sun', label: '일', short: '일' },
];

// JS getDay() 0=Sun … 6=Sat  →  key
const JS_DAY_TO_KEY = ['sun','mon','tue','wed','thu','fri','sat'];

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? '00' : '30';
  return `${h.toString().padStart(2, '0')}:${m}`;
});

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  pending:     { text: '대기 중',  color: '#f59e0b' },
  confirmed:   { text: '확정',     color: '#3b82f6' },
  in_progress: { text: '진행 중',  color: '#8b5cf6' },
  completed:   { text: '완료',     color: '#16a34a' },
  cancelled:   { text: '취소',     color: '#ef4444' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const day = ['일','월','화','수','목','금','토'][d.getDay()];
  return `${d.getMonth()+1}/${d.getDate()}(${day}) ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function fmtCalDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  const dow = new Date(dateStr).getDay();
  const dayLabel = ['일','월','화','수','목','금','토'][dow];
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일 (${dayLabel})`;
}

function getWeekKey(dateStr: string): string {
  return JS_DAY_TO_KEY[new Date(dateStr).getDay()];
}

// ─── Main Component ───────────────────────────────────────────────────────────

type ViewTab = 'weekly' | 'calendar';

export default function ScheduleScreen() {
  const { user } = useAuthStore();

  // ── Core state ─────────────────────────────────────────────────────────────
  const [hours, setHours]         = useState<Record<string, string[]>>({});
  const [isAvailable, setIsAvail] = useState(false);
  const [bookings, setBookings]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [dirty, setDirty]         = useState(false);

  // ── Tab & weekly state ─────────────────────────────────────────────────────
  const [viewTab, setViewTab]     = useState<ViewTab>('weekly');
  const [selectedDay, setDay]     = useState('mon');

  // ── Calendar state ─────────────────────────────────────────────────────────
  const [calDate, setCalDate]     = useState<string | null>(null);
  const [showSlotModal, setShowSlotModal] = useState(false);

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    load();
  }, [user?.id]);

  async function load() {
    try {
      setLoading(true);
      const [profile, raw] = await Promise.all([
        getCounselorDetail(user!.id),
        getCounselorBookings(user!.id),
      ]);
      setHours((profile as Counselor)?.available_hours ?? {});
      setIsAvail((profile as Counselor)?.is_available ?? false);

      const now = Date.now();
      setBookings(
        (raw ?? [])
          .filter((b: any) =>
            ['pending','confirmed','in_progress'].includes(b.status) &&
            (new Date(b.scheduled_at).getTime() >= now || b.status === 'in_progress')
          )
          .sort((a: any, b: any) =>
            new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
          )
          .slice(0, 10)
      );
    } catch (e) {
      console.error('[스케줄] 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }

  // ── Weekly slot toggle ─────────────────────────────────────────────────────
  function toggleWeeklySlot(time: string) {
    setHours(prev => {
      const cur  = prev[selectedDay] ?? [];
      const next = cur.includes(time) ? cur.filter(t => t !== time) : [...cur, time].sort();
      return { ...prev, [selectedDay]: next };
    });
    setDirty(true);
  }

  // ── Calendar helpers ───────────────────────────────────────────────────────
  // Returns undefined if no date-specific override
  function getDateOverride(dateStr: string): string[] | undefined {
    return hours[dateStr];
  }

  // Effective slots for a specific calendar date
  function getEffectiveSlots(dateStr: string): string[] {
    const override = getDateOverride(dateStr);
    if (override !== undefined) return override;
    return hours[getWeekKey(dateStr)] ?? [];
  }

  function isBlocked(dateStr: string): boolean {
    const override = getDateOverride(dateStr);
    return override !== undefined && override.length === 0;
  }

  function hasCustomOverride(dateStr: string): boolean {
    return getDateOverride(dateStr) !== undefined;
  }

  // Toggle a slot for a specific calendar date
  function toggleCalSlot(dateStr: string, time: string) {
    setHours(prev => {
      const current = prev[dateStr] ?? (prev[getWeekKey(dateStr)] ?? []);
      const next = current.includes(time)
        ? current.filter(t => t !== time)
        : [...current, time].sort();
      return { ...prev, [dateStr]: next };
    });
    setDirty(true);
  }

  // Block/unblock a specific date
  function toggleBlock(dateStr: string) {
    setHours(prev => {
      if (isBlocked(dateStr)) {
        // Unblock: restore weekly slots
        const { [dateStr]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [dateStr]: [] }; // block = empty array
    });
    setDirty(true);
  }

  // Remove date-specific override (revert to weekly)
  function resetDateOverride(dateStr: string) {
    setHours(prev => {
      const { [dateStr]: _, ...rest } = prev;
      return rest;
    });
    setDirty(true);
  }

  // ── Calendar marked dates ──────────────────────────────────────────────────
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    const today = new Date();

    // Build marks for ±3 months
    for (let i = -14; i < 90; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

      const blocked  = isBlocked(ds);
      const override = getDateOverride(ds);
      const weekly   = hours[getWeekKey(ds)] ?? [];
      const hasAny   = override !== undefined ? override.length > 0 : weekly.length > 0;

      let dot: object | undefined;
      if (blocked) {
        dot = { color: C.red };
      } else if (override !== undefined && override.length > 0) {
        dot = { color: C.gold };
      } else if (weekly.length > 0) {
        dot = { color: C.green };
      }

      marks[ds] = {
        dots: dot ? [dot] : [],
        disabled: i < 0,
        disableTouchEvent: i < 0,
      };
    }

    if (calDate) {
      marks[calDate] = {
        ...marks[calDate],
        selected: true,
        selectedColor: C.brown,
        selectedTextColor: C.white,
      };
    }

    return marks;
  }, [hours, calDate]);

  // ── Save ───────────────────────────────────────────────────────────────────
  async function save() {
    if (!user?.id) return;
    try {
      setSaving(true);
      await updateCounselorProfile(user.id, {
        available_hours: hours,
        is_available: isAvailable,
      });
      setDirty(false);
      if (Platform.OS === 'web') window.alert('스케줄이 저장되었습니다.');
      else Alert.alert('저장 완료', '스케줄이 업데이트되었습니다.');
    } catch (e: any) {
      const msg = e?.message ?? '저장에 실패했습니다.';
      console.error('[스케줄 저장 실패]', msg, e);
      if (Platform.OS === 'web') window.alert(`오류: ${msg}`);
      else Alert.alert('오류', msg);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={C.brown} /></View>;
  }

  const daySlots     = hours[selectedDay] ?? [];
  const today        = todayStr();
  const calSlots     = calDate ? getEffectiveSlots(calDate) : [];
  const calBlocked   = calDate ? isBlocked(calDate) : false;
  const calOverridden = calDate ? hasCustomOverride(calDate) : false;

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>

      {/* ── 상단: 가용 상태 + 탭 ─────────────────────────────── */}
      <View style={s.topBar}>
        {/* 가용 상태 토글 */}
        <View style={s.availRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.availTitle}>상담 가능</Text>
            <Text style={s.availSub}>{isAvailable ? '노출 중' : '숨김'}</Text>
          </View>
          <Switch
            value={isAvailable}
            onValueChange={v => { setIsAvail(v); setDirty(true); }}
            trackColor={{ false: '#e0d5c8', true: C.gold }}
            thumbColor={isAvailable ? C.brown : '#c8bdb0'}
          />
        </View>

        {/* 뷰 탭 */}
        <View style={s.viewTabs}>
          {(['weekly','calendar'] as ViewTab[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[s.viewTab, viewTab === t && s.viewTabActive]}
              onPress={() => setViewTab(t)}
              activeOpacity={0.8}
            >
              <Text style={[s.viewTabText, viewTab === t && s.viewTabTextActive]}>
                {t === 'weekly' ? '📋 주간 반복' : '📅 달력'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ══ 주간 반복 탭 ════════════════════════════════════ */}
        {viewTab === 'weekly' && (
          <>
            <Text style={s.sectionTitle}>요일별 반복 스케줄</Text>
            <View style={s.card}>
              {/* 요일 탭 */}
              <ScrollView
                horizontal showsHorizontalScrollIndicator={false}
                style={s.tabBar} contentContainerStyle={s.tabContent}
              >
                {DAYS.map(d => {
                  const active   = d.key === selectedDay;
                  const hasSlots = (hours[d.key] ?? []).length > 0;
                  return (
                    <TouchableOpacity
                      key={d.key}
                      style={[s.dayTab, active && s.dayTabActive]}
                      onPress={() => setDay(d.key)}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.dayTabText, active && s.dayTabTextActive]}>{d.label}</Text>
                      {hasSlots && <View style={[s.dot, active && s.dotActive]} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* 시간 슬롯 그리드 */}
              <View style={s.slotGrid}>
                {TIME_SLOTS.map(t => {
                  const on = daySlots.includes(t);
                  return (
                    <TouchableOpacity
                      key={t} style={[s.slot, on && s.slotOn]}
                      onPress={() => toggleWeeklySlot(t)} activeOpacity={0.7}
                    >
                      <Text style={[s.slotText, on && s.slotTextOn]}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.slotSummary}>
                {daySlots.length === 0
                  ? '선택된 시간 없음'
                  : `${daySlots.length}개 선택됨`}
              </Text>
            </View>
          </>
        )}

        {/* ══ 달력 탭 ════════════════════════════════════════ */}
        {viewTab === 'calendar' && (
          <>
            {/* 범례 */}
            <View style={s.legend}>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: C.green }]} />
                <Text style={s.legendText}>주간 설정</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: C.gold }]} />
                <Text style={s.legendText}>개별 설정</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: C.red }]} />
                <Text style={s.legendText}>휴무</Text>
              </View>
            </View>

            {/* 달력 */}
            <View style={s.calendarCard}>
              <Calendar
                markingType="multi-dot"
                markedDates={markedDates}
                onDayPress={day => {
                  setCalDate(day.dateString);
                  setShowSlotModal(true);
                }}
                minDate={today}
                theme={{
                  backgroundColor: C.white,
                  calendarBackground: C.white,
                  textSectionTitleColor: C.brownPale,
                  selectedDayBackgroundColor: C.brown,
                  selectedDayTextColor: C.white,
                  todayTextColor: C.brown,
                  todayBackgroundColor: C.goldBg,
                  dayTextColor: C.brownLight,
                  textDisabledColor: '#d0c8bc',
                  dotColor: C.gold,
                  monthTextColor: C.brown,
                  arrowColor: C.brown,
                  textMonthFontWeight: '800',
                  textDayFontSize: 13,
                  textMonthFontSize: 15,
                  textDayHeaderFontSize: 12,
                  textDayHeaderFontWeight: '700',
                  'stylesheet.calendar.header': {
                    week: {
                      marginTop: 4,
                      flexDirection: 'row',
                      justifyContent: 'space-around',
                    },
                  },
                } as any}
              />
            </View>

            {/* 날짜별 오버라이드 목록 */}
            {Object.entries(hours)
              .filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k))
              .sort(([a],[b]) => a.localeCompare(b))
              .length > 0 && (
              <>
                <Text style={s.sectionTitle}>개별 설정된 날짜</Text>
                <View style={s.card}>
                  {Object.entries(hours)
                    .filter(([k]) => /^\d{4}-\d{2}-\d{2}$/.test(k))
                    .sort(([a],[b]) => a.localeCompare(b))
                    .map(([dateStr, slots], i, arr) => (
                      <View key={dateStr}>
                        {i > 0 && <View style={s.itemSep} />}
                        <View style={s.overrideRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={s.overrideDateText}>{fmtCalDate(dateStr)}</Text>
                            {slots.length === 0 ? (
                              <View style={[s.overrideBadge, { backgroundColor: C.redBg }]}>
                                <Text style={[s.overrideBadgeText, { color: C.red }]}>휴무</Text>
                              </View>
                            ) : (
                              <Text style={s.overrideSlotsText}>{slots.join(' · ')}</Text>
                            )}
                          </View>
                          <TouchableOpacity
                            style={s.resetBtn}
                            onPress={() => resetDateOverride(dateStr)}
                            activeOpacity={0.7}
                          >
                            <Text style={s.resetBtnText}>초기화</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                </View>
              </>
            )}
          </>
        )}

        {/* ── 저장 버튼 ─────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.saveBtn, (!dirty || saving) && s.saveBtnOff]}
          onPress={save} disabled={!dirty || saving} activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator size="small" color={C.cream} />
            : <Text style={s.saveBtnText}>변경 사항 저장</Text>}
        </TouchableOpacity>

        {/* ── 예정 상담 ─────────────────────────────────────── */}
        <Text style={s.sectionTitle}>예정된 상담</Text>
        {bookings.length === 0 ? (
          <View style={[s.card, s.empty]}>
            <Text style={s.emptyText}>예정된 상담이 없습니다</Text>
          </View>
        ) : (
          bookings.map((b, i) => {
            const st    = STATUS_LABEL[b.status] ?? { text: b.status, color: C.brownPale };
            const name  = b.users?.name ?? '이용자';
            const emoji = b.users?.avatar_emoji ?? '🙋';
            return (
              <View key={b.id} style={[s.bookingCard, i > 0 && { marginTop: 8 }]}>
                <View style={s.bookingAvatar}>
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.bookingName}>{name}</Text>
                  <Text style={s.bookingTime}>{fmtDate(b.scheduled_at)}</Text>
                  <Text style={s.bookingMeta}>{b.duration_minutes}분 · ₩{b.amount.toLocaleString()}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: st.color + '22' }]}>
                  <Text style={[s.statusText, { color: st.color }]}>{st.text}</Text>
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ══ 날짜 편집 모달 ══════════════════════════════════════ */}
      <Modal
        visible={showSlotModal && !!calDate}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSlotModal(false)}
      >
        <TouchableOpacity
          style={s.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowSlotModal(false)}
        />
        <View style={s.modalSheet}>
          {calDate && (
            <>
              {/* 모달 헤더 */}
              <View style={s.modalHandle} />
              <View style={s.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.modalDateText}>{fmtCalDate(calDate)}</Text>
                  {calOverridden ? (
                    calBlocked ? (
                      <View style={[s.overrideBadge, { backgroundColor: C.redBg, marginTop: 4 }]}>
                        <Text style={[s.overrideBadgeText, { color: C.red }]}>휴무 설정됨</Text>
                      </View>
                    ) : (
                      <View style={[s.overrideBadge, { backgroundColor: C.goldBg, marginTop: 4 }]}>
                        <Text style={[s.overrideBadgeText, { color: '#92400e' }]}>개별 설정됨</Text>
                      </View>
                    )
                  ) : (
                    <View style={[s.overrideBadge, { backgroundColor: C.greenBg, marginTop: 4 }]}>
                      <Text style={[s.overrideBadgeText, { color: C.green }]}>주간 설정 적용 중</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity onPress={() => setShowSlotModal(false)} style={s.modalCloseBtn}>
                  <Text style={s.modalCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* 휴무 토글 */}
              <View style={s.blockRow}>
                <Text style={s.blockLabel}>이날 휴무로 설정</Text>
                <Switch
                  value={calBlocked}
                  onValueChange={() => toggleBlock(calDate)}
                  trackColor={{ false: '#e0d5c8', true: C.red }}
                  thumbColor={calBlocked ? '#fff' : '#c8bdb0'}
                />
              </View>

              {/* 시간 슬롯 */}
              {!calBlocked && (
                <>
                  <Text style={s.modalSlotHint}>
                    {calOverridden ? '이날 개별 시간 설정' : '시간 선택 시 이날만 개별 적용됩니다'}
                  </Text>
                  <View style={s.modalSlotGrid}>
                    {TIME_SLOTS.map(t => {
                      const on = calSlots.includes(t);
                      return (
                        <TouchableOpacity
                          key={t}
                          style={[s.slot, on && s.slotOn]}
                          onPress={() => toggleCalSlot(calDate, t)}
                          activeOpacity={0.7}
                        >
                          <Text style={[s.slotText, on && s.slotTextOn]}>{t}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* 초기화 + 닫기 */}
              <View style={s.modalFooter}>
                {calOverridden && (
                  <TouchableOpacity
                    style={s.resetBtnLg}
                    onPress={() => { resetDateOverride(calDate); setShowSlotModal(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={s.resetBtnLgText}>주간 설정으로 초기화</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={s.modalDoneBtn}
                  onPress={() => setShowSlotModal(false)}
                  activeOpacity={0.8}
                >
                  <Text style={s.modalDoneBtnText}>완료</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cream },
  content: { padding: 16 },

  /* 상단 바 */
  topBar: {
    backgroundColor: C.white,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.sep,
    shadowColor: C.brown,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  availRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  availTitle: { fontSize: 14, fontWeight: '700', color: C.brown },
  availSub:   { fontSize: 11, color: C.brownPale, marginTop: 1 },

  viewTabs: { flexDirection: 'row', gap: 8 },
  viewTab: {
    flex: 1, paddingVertical: 7, borderRadius: 10,
    backgroundColor: C.cream, alignItems: 'center',
    borderWidth: 1, borderColor: '#e8e0d4',
  },
  viewTabActive: { backgroundColor: C.brown, borderColor: C.brown },
  viewTabText:   { fontSize: 13, fontWeight: '700', color: C.brownPale },
  viewTabTextActive: { color: C.gold },

  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: C.brownPale,
    letterSpacing: 0.5, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 4,
  },

  card: {
    backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: C.brown, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  itemSep: { height: 1, backgroundColor: C.sep, marginHorizontal: 0 },

  /* 요일 탭 */
  tabBar:    { marginBottom: 14 },
  tabContent: { gap: 6 },
  dayTab: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.cream, position: 'relative',
  },
  dayTabActive:     { backgroundColor: C.brown },
  dayTabText:       { fontSize: 14, fontWeight: '600', color: C.brownPale },
  dayTabTextActive: { color: C.gold },
  dot: {
    position: 'absolute', bottom: 5,
    width: 4, height: 4, borderRadius: 2, backgroundColor: C.gold,
  },
  dotActive: { backgroundColor: C.cream },

  /* 시간 슬롯 공통 */
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  slot: {
    width: '22%', paddingVertical: 10, borderRadius: 10,
    alignItems: 'center', backgroundColor: C.cream,
    borderWidth: 1, borderColor: '#e8e0d4',
  },
  slotOn:     { backgroundColor: C.goldBg, borderColor: C.gold },
  slotText:   { fontSize: 13, fontWeight: '600', color: C.brownPale },
  slotTextOn: { color: C.brown },
  slotSummary: {
    fontSize: 11, color: C.brownPale, textAlign: 'center',
    borderTopWidth: 1, borderTopColor: C.sep, paddingTop: 10,
  },

  /* 달력 */
  legend: {
    flexDirection: 'row', gap: 16,
    marginBottom: 10, paddingHorizontal: 2,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: C.brownPale, fontWeight: '600' },

  calendarCard: {
    backgroundColor: C.white, borderRadius: 16, overflow: 'hidden',
    marginBottom: 12,
    shadowColor: C.brown, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },

  /* 개별 오버라이드 목록 */
  overrideRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 },
  overrideDateText: { fontSize: 13, fontWeight: '700', color: C.brown, marginBottom: 4 },
  overrideSlotsText: { fontSize: 11, color: C.brownPale },
  overrideBadge: {
    alignSelf: 'flex-start', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  overrideBadgeText: { fontSize: 11, fontWeight: '700' },
  resetBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, backgroundColor: C.cream,
    borderWidth: 1, borderColor: '#e0d5c8',
  },
  resetBtnText: { fontSize: 12, fontWeight: '700', color: C.brownPale },

  /* 저장 버튼 */
  saveBtn: {
    backgroundColor: C.brown, borderRadius: 14, height: 50,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    shadowColor: C.brown, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },
  saveBtnOff:  { backgroundColor: '#c8bdb0', shadowOpacity: 0 },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: C.cream, letterSpacing: 0.3 },

  /* 예약 카드 */
  bookingCard: {
    backgroundColor: C.white, borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: C.brown, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  bookingAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.cream, alignItems: 'center', justifyContent: 'center',
  },
  bookingName: { fontSize: 14, fontWeight: '700', color: C.brown, marginBottom: 2 },
  bookingTime: { fontSize: 12, color: C.brownLight, marginBottom: 2 },
  bookingMeta: { fontSize: 11, color: C.brownPale },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText:  { fontSize: 11, fontWeight: '700' },
  empty:       { alignItems: 'center', paddingVertical: 28 },
  emptyText:   { fontSize: 13, color: C.brownPale },

  /* 날짜 편집 모달 */
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,10,5,0.45)',
  },
  modalSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: C.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0d5c8',
    alignSelf: 'center', marginTop: 10, marginBottom: 6,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 8, marginBottom: 8,
    borderBottomWidth: 1, borderBottomColor: C.sep,
  },
  modalDateText:  { fontSize: 16, fontWeight: '800', color: C.brown },
  modalCloseBtn:  { padding: 4 },
  modalCloseText: { fontSize: 16, color: C.brownPale },

  blockRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.sep, marginBottom: 10,
  },
  blockLabel: { fontSize: 14, fontWeight: '700', color: C.brown },

  modalSlotHint: { fontSize: 11, color: C.brownPale, marginBottom: 10 },
  modalSlotGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16,
  },

  modalFooter: { flexDirection: 'row', gap: 8, marginTop: 4 },
  resetBtnLg: {
    flex: 1, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.cream, borderWidth: 1, borderColor: '#e0d5c8',
  },
  resetBtnLgText: { fontSize: 13, fontWeight: '700', color: C.brownPale },
  modalDoneBtn: {
    flex: 1, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', backgroundColor: C.brown,
  },
  modalDoneBtnText: { fontSize: 14, fontWeight: '800', color: C.cream },
});
