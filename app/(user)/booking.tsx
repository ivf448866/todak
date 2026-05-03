/**
 * 예약 화면 — 날짜 → 시간 → 확인 → 계좌이체 안내 → 완료
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Calendar } from 'react-native-calendars';
import { format, addMonths, parseISO, getDay } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { Specialty } from '@/types';

// ─── 계좌 정보 ────────────────────────────────────────────────────────────────
const BANK_NAME    = '기업은행';
const BANK_ACCOUNT = '010-8972-5642';
const BANK_HOLDER  = '최성찬';

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = 'date' | 'time' | 'confirm' | 'complete';
type SlotStatus = 'available' | 'booked' | 'mine';

interface SlotInfo {
  time: string;
  status: SlotStatus;
}

interface CounselorInfo {
  id: string;
  name: string;
  avatar_emoji: string | null;
  specialty: Specialty[];
  hourly_rate: number;
  available_hours: Record<string, string[]>;
}

const TIME_GROUPS = [
  { label: '🌅 오전', from: 0,  to: 12 },
  { label: '☀️ 오후', from: 12, to: 18 },
  { label: '🌙 저녁', from: 18, to: 24 },
];

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
} as const;

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DURATION_MIN = 30;

const STEP_LABELS: Record<Step, string> = {
  date: '날짜 선택',
  time: '시간 선택',
  confirm: '예약 확인',
  complete: '완료',
};
const WIZARD_STEPS: Step[] = ['date', 'time', 'confirm'];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BookingScreen() {
  const { counselorId } = useLocalSearchParams<{ counselorId: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('date');
  const [counselor, setCounselor] = useState<CounselorInfo | null>(null);
  const [loadingCounselor, setLoadingCounselor] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingPayment, setLoadingPayment] = useState(false);

  // ── Booking data ──────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]); // kept for compat
  const [slotData, setSlotData] = useState<SlotInfo[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);

  // ── Fetch counselor ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!counselorId) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('counselors')
          .select('id, hourly_rate, available_hours, specialty, users(name, avatar_emoji)')
          .eq('id', counselorId)
          .single();

        if (error) throw error;

        setCounselor({
          id: data.id,
          name: (data.users as any)?.name ?? '상담사',
          avatar_emoji: (data.users as any)?.avatar_emoji ?? null,
          specialty: data.specialty as Specialty[],
          hourly_rate: data.hourly_rate,
          available_hours: (data.available_hours as Record<string, string[]>) ?? {},
        });
      } catch (err) {
        console.error('상담사 조회 실패:', err);
      } finally {
        setLoadingCounselor(false);
      }
    })();
  }, [counselorId]);

  // ── Fetch slots when date changes ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedDate || !counselor) return;
    fetchAvailableSlots(selectedDate);
  }, [selectedDate, counselor]);

  const fetchAvailableSlots = async (date: string) => {
    if (!counselor || !user) return;
    setLoadingSlots(true);
    try {
      const dayKey = DAY_KEYS[getDay(parseISO(date))];
      const override  = counselor.available_hours[date];
      const allSlots: string[] = override !== undefined
        ? override
        : (counselor.available_hours[dayKey] ?? []);

      const dayStart = new Date(`${date}T00:00:00`);
      const dayEnd   = new Date(`${date}T23:59:59.999`);

      const { data: existing } = await supabase
        .from('bookings')
        .select('scheduled_at, user_id, duration_minutes')
        .eq('counselor_id', counselor.id)
        .gte('scheduled_at', dayStart.toISOString())
        .lte('scheduled_at', dayEnd.toISOString())
        .in('status', ['pending', 'confirmed', 'in_progress']);

      // 예약된 시간 범위 목록 (시작 ~ 끝)
      const bookedRanges = (existing ?? []).map(b => {
        const start = new Date(b.scheduled_at);
        const end   = new Date(start.getTime() + (b.duration_minutes ?? DURATION_MIN) * 60000);
        return { start, end, userId: b.user_id };
      });

      // 슬롯 시작 시각이 어느 예약 범위와도 겹치면 충돌
      function overlaps(slotTime: string): { booked: boolean; mine: boolean } {
        const [h, m] = slotTime.split(':').map(Number);
        const slotStart = new Date(date);
        slotStart.setHours(h, m, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + DURATION_MIN * 60000);

        for (const r of bookedRanges) {
          const clash = slotStart < r.end && slotEnd > r.start;
          if (clash) return { booked: true, mine: r.userId === user.id };
        }
        return { booked: false, mine: false };
      }

      const data: SlotInfo[] = allSlots.map(t => {
        const { booked, mine } = overlaps(t);
        return { time: t, status: mine ? 'mine' : booked ? 'booked' : 'available' };
      });

      setSlotData(data);
      setAvailableSlots(data.filter(s => s.status === 'available').map(s => s.time));
    } catch (err) {
      console.error('슬롯 조회 실패:', err);
    } finally {
      setLoadingSlots(false);
    }
  };

  // ── Calendar markedDates ──────────────────────────────────────────────────
  const markedDates = useCallback((): Record<string, object> => {
    if (!counselor) return {};
    const marks: Record<string, object> = {};
    const today = new Date();

    for (let i = 0; i < 62; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayKey  = DAY_KEYS[d.getDay()];

      // 날짜별 오버라이드 우선 적용
      const override  = counselor.available_hours[dateStr];
      const weeklySlots = counselor.available_hours[dayKey] ?? [];
      const effective = override !== undefined ? override : weeklySlots;
      const hasSlots  = effective.length > 0;

      if (!hasSlots) {
        marks[dateStr] = { disabled: true, disableTouchEvent: true };
      }
    }

    if (selectedDate) {
      marks[selectedDate] = {
        ...(marks[selectedDate] ?? {}),
        selected: true,
        selectedColor: C.brown,
        selectedTextColor: C.white,
      };
    }

    return marks;
  }, [counselor, selectedDate]);

  // ── Create pending booking ────────────────────────────────────────────────
  const createPendingBooking = async (): Promise<string> => {
    if (!user || !counselor || !selectedDate || !selectedTime) {
      throw new Error('필수 정보가 없습니다');
    }
    // new Date('YYYY-MM-DD')는 UTC 자정을 만들어 setHours()와 이중 오프셋 발생.
    // new Date(year, month-1, day, h, m)으로 로컬 시간 직접 생성.
    const [h, m] = selectedTime.split(':').map(Number);
    const [year, mo, day] = selectedDate.split('-').map(Number);
    const dt = new Date(year, mo - 1, day, h, m, 0, 0);

    const { data, error } = await supabase
      .from('bookings')
      .insert({
        user_id: user.id,
        counselor_id: counselor.id,
        scheduled_at: dt.toISOString(),
        duration_minutes: DURATION_MIN,
        status: 'pending',
        amount: counselor.hourly_rate,
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id as string;
  };

  // ── Start payment ─────────────────────────────────────────────────────────
  const handleStartPayment = async () => {
    if (!counselor || !selectedDate || !selectedTime || !user) return;
    setLoadingPayment(true);
    try {
      const newBookingId = await createPendingBooking();
      setBookingId(newBookingId);
      setStep('complete');
    } catch (err: any) {
      Alert.alert('오류', err.message ?? '예약 신청에 실패했어요. 다시 시도해주세요.');
    } finally {
      setLoadingPayment(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  if (loadingCounselor) {
    return (
      <View style={[s.centered, { backgroundColor: C.cream }]}>
        <ActivityIndicator size="large" color={C.brown} />
      </View>
    );
  }

  if (!counselor) {
    return (
      <View style={[s.centered, { backgroundColor: C.cream }]}>
        <Text style={{ color: C.brownPale }}>정보를 불러올 수 없어요</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: C.brown, fontWeight: '700' }}>← 돌아가기</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const wizardIndex = WIZARD_STEPS.indexOf(step);

  return (
    <View style={{ flex: 1, backgroundColor: C.cream }}>

      {/* ── Wizard Progress ── */}
      {wizardIndex >= 0 && (
        <View style={s.wizard}>
          {WIZARD_STEPS.map((st, i) => (
            <React.Fragment key={st}>
              <View style={[s.wizardDot, i <= wizardIndex && s.wizardDotActive]}>
                {i < wizardIndex ? (
                  <Text style={{ fontSize: 10, color: C.white }}>✓</Text>
                ) : (
                  <Text style={[s.wizardNum, i <= wizardIndex && s.wizardNumActive]}>{i + 1}</Text>
                )}
              </View>
              {i < WIZARD_STEPS.length - 1 && (
                <View style={[s.wizardLine, i < wizardIndex && s.wizardLineActive]} />
              )}
            </React.Fragment>
          ))}
          <Text style={s.wizardLabel}>{STEP_LABELS[step]}</Text>
        </View>
      )}

      {/* ════════════════════════════════════════════
          STEP 1 — DATE
      ════════════════════════════════════════════ */}
      {step === 'date' && (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View style={s.stepHeader}>
            <Text style={s.stepTitle}>언제 상담받고 싶으세요?</Text>
            <Text style={s.stepSub}>{counselor.name} 상담사와 함께해요</Text>
          </View>

          <Calendar
            minDate={format(new Date(), 'yyyy-MM-dd')}
            maxDate={format(addMonths(new Date(), 2), 'yyyy-MM-dd')}
            markedDates={markedDates()}
            onDayPress={(day) => {
              setSelectedDate(day.dateString);
              setSelectedTime(null);
              setSlotData([]);
            }}
            theme={{
              backgroundColor: C.cream,
              calendarBackground: C.white,
              selectedDayBackgroundColor: C.brown,
              selectedDayTextColor: C.white,
              todayTextColor: '#e8a838',
              dayTextColor: C.brown,
              textDisabledColor: '#c5b9ae',
              monthTextColor: C.brown,
              arrowColor: C.brown,
              textDayFontSize: 14,
              textMonthFontSize: 16,
              textMonthFontWeight: '700',
              textDayFontWeight: '500',
            }}
            style={s.calendar}
          />

          <View style={s.legendRow}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#c5b9ae' }} />
            <Text style={s.legendText}>예약 불가 날짜</Text>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.brown, marginLeft: 16 }} />
            <Text style={s.legendText}>선택된 날짜</Text>
          </View>
        </ScrollView>
      )}

      {/* ════════════════════════════════════════════
          STEP 2 — TIME
      ════════════════════════════════════════════ */}
      {step === 'time' && (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View style={s.stepHeader}>
            <Text style={s.stepTitle}>몇 시가 편하세요?</Text>
            <Text style={s.stepSub}>{selectedDate} · {DURATION_MIN}분 상담</Text>
          </View>

          {/* 범례 */}
          <View style={s.slotLegend}>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: C.cream, borderColor: '#e8e0d4' }]} /><Text style={s.legendLabel}>예약 가능</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#f3f4f6', borderColor: '#e5e7eb' }]} /><Text style={s.legendLabel}>예약됨</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#fef3c7', borderColor: C.gold }]} /><Text style={s.legendLabel}>내 예약</Text></View>
          </View>

          {loadingSlots ? (
            <View style={s.centered}><ActivityIndicator size="large" color={C.brown} /></View>
          ) : slotData.length === 0 ? (
            <View style={s.emptyState}>
              <Text style={{ fontSize: 28, marginBottom: 12 }}>😔</Text>
              <Text style={s.emptyTitle}>이 날은 예약 가능한 시간이 없어요</Text>
              <TouchableOpacity onPress={() => { setStep('date'); setSelectedDate(null); }} style={{ marginTop: 16 }}>
                <Text style={s.linkText}>← 날짜 다시 선택</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {TIME_GROUPS.map(group => {
                const groupSlots = slotData.filter(s => {
                  const h = parseInt(s.time.split(':')[0], 10);
                  return h >= group.from && h < group.to;
                });
                if (groupSlots.length === 0) return null;
                const availCount = groupSlots.filter(s => s.status === 'available').length;
                return (
                  <View key={group.label} style={s.timeGroup}>
                    <View style={s.timeGroupHeader}>
                      <Text style={s.timeGroupLabel}>{group.label}</Text>
                      <Text style={s.timeGroupCount}>
                        {availCount > 0 ? `${availCount}개 가능` : '모두 예약됨'}
                      </Text>
                    </View>
                    <View style={s.slotsGrid}>
                      {groupSlots.map(({ time, status }) => {
                        const isSelected = selectedTime === time;
                        const isAvail    = status === 'available';
                        const isMine     = status === 'mine';
                        const isBooked   = status === 'booked';
                        return (
                          <TouchableOpacity
                            key={time}
                            style={[
                              s.slotBtn,
                              isSelected && s.slotBtnActive,
                              isBooked   && s.slotBtnBooked,
                              isMine     && s.slotBtnMine,
                            ]}
                            onPress={() => isAvail && setSelectedTime(time)}
                            activeOpacity={isAvail ? 0.75 : 1}
                            disabled={!isAvail}
                          >
                            <Text style={[
                              s.slotText,
                              isSelected && s.slotTextActive,
                              isBooked   && s.slotTextBooked,
                              isMine     && s.slotTextMine,
                            ]}>
                              {time}
                            </Text>
                            {isBooked && <Text style={s.slotSubText}>예약됨</Text>}
                            {isMine   && <Text style={[s.slotSubText, { color: '#92400e' }]}>내 예약</Text>}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
              {availableSlots.length === 0 && (
                <View style={s.emptyState}>
                  <Text style={{ fontSize: 28, marginBottom: 12 }}>😔</Text>
                  <Text style={s.emptyTitle}>예약 가능한 시간이 없어요</Text>
                  <TouchableOpacity onPress={() => { setStep('date'); setSelectedDate(null); }} style={{ marginTop: 16 }}>
                    <Text style={s.linkText}>← 날짜 다시 선택</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* ════════════════════════════════════════════
          STEP 3 — CONFIRM
      ════════════════════════════════════════════ */}
      {step === 'confirm' && (
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View style={s.stepHeader}>
            <Text style={s.stepTitle}>예약 내용 확인</Text>
          </View>

          {/* Counselor summary */}
          <View style={s.confirmCard}>
            <View style={s.confirmCounselorRow}>
              <View style={s.avatarMd}>
                <Text style={{ fontSize: 28 }}>{counselor.avatar_emoji ?? '🎧'}</Text>
              </View>
              <View style={{ marginLeft: 14, flex: 1 }}>
                <Text style={s.confirmName}>{counselor.name}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {counselor.specialty.map((sp) => (
                    <View key={sp} style={s.chip}>
                      <Text style={s.chipText}>{sp}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>

            <View style={s.divider} />

            <InfoRow label="날짜" value={selectedDate ?? ''} />
            <InfoRow label="시간" value={`${selectedTime} 시작`} />
            <InfoRow label="상담 시간" value={`${DURATION_MIN}분`} />
            <InfoRow label="방식" value="화상 상담" />

            <View style={s.divider} />

            <View style={s.priceRow}>
              <Text style={s.priceLabel}>결제 금액</Text>
              <Text style={s.priceValue}>{counselor.hourly_rate.toLocaleString()}원</Text>
            </View>
          </View>

          {/* Refund policy */}
          <View style={s.policyBox}>
            <Text style={s.policyTitle}>환불 정책</Text>
            <Text style={s.policyText}>
              · 상담 24시간 전 취소 시 전액 환불{'\n'}
              · 상담 24시간 미만 취소 시 50% 환불{'\n'}
              · 상담 시작 후 취소 불가
            </Text>
          </View>
        </ScrollView>
      )}


      {/* ════════════════════════════════════════════
          STEP 5 — COMPLETE
      ════════════════════════════════════════════ */}
      {step === 'complete' && (
        <ScrollView contentContainerStyle={[s.centered, { paddingHorizontal: 28, paddingVertical: 40 }]}>
          <View style={s.completeCircle}>
            <Text style={{ fontSize: 40, color: C.brown }}>📋</Text>
          </View>

          <Text style={s.completeTitle}>예약 신청 완료!</Text>
          <Text style={s.completeSub}>
            아래 계좌로 입금해 주시면{'\n'}관리자 확인 후 예약이 확정돼요
          </Text>

          {/* 계좌 정보 */}
          <View style={s.bankCard}>
            <Text style={s.bankCardTitle}>입금 계좌 정보</Text>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>은행</Text>
              <Text style={s.bankValue}>{BANK_NAME}</Text>
            </View>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>계좌번호</Text>
              <Text style={[s.bankValue, { letterSpacing: 1 }]}>{BANK_ACCOUNT}</Text>
            </View>
            <View style={s.bankRow}>
              <Text style={s.bankLabel}>예금주</Text>
              <Text style={s.bankValue}>{BANK_HOLDER}</Text>
            </View>
            <View style={[s.bankRow, s.bankAmountRow]}>
              <Text style={s.bankLabel}>입금 금액</Text>
              <Text style={s.bankAmount}>{counselor.hourly_rate.toLocaleString()}원</Text>
            </View>
          </View>

          {/* 예약 요약 */}
          <View style={s.completeSummaryCard}>
            <InfoRow label="상담사" value={counselor.name} />
            <InfoRow label="날짜"   value={selectedDate ?? ''} />
            <InfoRow label="시간"   value={`${selectedTime} 시작`} />
            <InfoRow label="상담 시간" value={`${DURATION_MIN}분`} />
          </View>

          <View style={s.noticeBox}>
            <Text style={s.noticeText}>
              💬 입금 확인 후 앱 알림으로 예약 확정을 안내해 드려요.{'\n'}
              입금자명을 <Text style={{ fontWeight: '800' }}>{counselor.name} 상담</Text>으로 입력해 주세요.
            </Text>
          </View>

          <TouchableOpacity
            style={[s.primaryBtn, { width: '100%', marginTop: 8 }]}
            onPress={() => router.replace('/(user)/home' as any)}
          >
            <Text style={s.primaryBtnText}>홈으로 돌아가기</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Bottom CTA (wizard steps) ── */}
      {wizardIndex >= 0 && (
        <View style={s.bottomBar}>
          {step === 'date' && (
            <TouchableOpacity
              style={[s.primaryBtn, !selectedDate && s.btnDisabled]}
              disabled={!selectedDate}
              onPress={() => setStep('time')}
            >
              <Text style={s.primaryBtnText}>다음 — 시간 선택</Text>
            </TouchableOpacity>
          )}

          {step === 'time' && (
            <>
              <TouchableOpacity
                style={[s.primaryBtn, !selectedTime && s.btnDisabled]}
                disabled={!selectedTime}
                onPress={() => setStep('confirm')}
              >
                <Text style={s.primaryBtnText}>다음 — 예약 확인</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ marginTop: 10, alignItems: 'center' }} onPress={() => setStep('date')}>
                <Text style={s.linkText}>← 날짜 다시 선택</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'confirm' && (
            <>
              <TouchableOpacity
                style={[s.primaryBtn, loadingPayment && s.btnDisabled]}
                disabled={loadingPayment}
                onPress={handleStartPayment}
              >
                {loadingPayment ? (
                  <ActivityIndicator size="small" color={C.white} />
                ) : (
                  <Text style={s.primaryBtnText}>
                    예약 신청하기
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={{ marginTop: 10, alignItems: 'center' }} onPress={() => setStep('time')}>
                <Text style={s.linkText}>← 시간 다시 선택</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }}>
      <Text style={{ fontSize: 14, color: '#8c7b6b', fontWeight: '500' }}>{label}</Text>
      <Text style={{ fontSize: 14, color: '#3d2c1e', fontWeight: '600' }}>{value}</Text>
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

  // Wizard
  wizard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 36,
    paddingVertical: 14,
    backgroundColor: '#faf8f5',
    borderBottomWidth: 1,
    borderBottomColor: '#f0ebe3',
  },
  wizardDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e8e0d5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wizardDotActive: { backgroundColor: '#3d2c1e' },
  wizardNum: { fontSize: 12, fontWeight: '700', color: '#8c7b6b' },
  wizardNumActive: { color: '#ffffff' },
  wizardLine: { flex: 1, height: 2, backgroundColor: '#e8e0d5' },
  wizardLineActive: { backgroundColor: '#3d2c1e' },
  wizardLabel: {
    position: 'absolute',
    right: 16,
    fontSize: 12,
    color: '#8c7b6b',
    fontWeight: '600',
  },

  // Step header
  stepHeader: { padding: 24, paddingBottom: 12 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: '#3d2c1e', marginBottom: 4 },
  stepSub: { fontSize: 14, color: '#8c7b6b' },

  // Calendar
  calendar: {
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#3d2c1e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 20,
    paddingTop: 16,
  },
  legendText: { fontSize: 12, color: '#8c7b6b' },

  // Time slots
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 20,
  },
  slotBtn: {
    width: '30%',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e8e0d5',
    shadowColor: '#3d2c1e',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  slotBtnActive: { backgroundColor: '#3d2c1e', borderColor: '#3d2c1e' },
  slotBtnBooked: {
    backgroundColor: '#f3f4f6', borderColor: '#e5e7eb',
    shadowOpacity: 0,
  },
  slotBtnMine: {
    backgroundColor: '#fef3c7', borderColor: '#f0c98a',
    shadowOpacity: 0,
  },
  slotText: { fontSize: 13, fontWeight: '700', color: '#5a4633' },
  slotTextActive: { color: '#ffffff' },
  slotTextBooked: { color: '#9ca3af', fontWeight: '500' },
  slotTextMine:   { color: '#92400e', fontWeight: '700' },
  slotSubText:    { fontSize: 9, color: '#9ca3af', marginTop: 2, fontWeight: '600' },

  slotLegend: {
    flexDirection: 'row', gap: 16,
    paddingHorizontal: 20, paddingBottom: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 10, height: 10, borderRadius: 5, borderWidth: 1 },
  legendLabel: { fontSize: 11, color: '#8c7b6b', fontWeight: '600' },

  timeGroup: { marginBottom: 4 },
  timeGroupHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 8,
  },
  timeGroupLabel: { fontSize: 13, fontWeight: '800', color: '#3d2c1e' },
  timeGroupCount: { fontSize: 11, color: '#8c7b6b', fontWeight: '600' },

  // Confirm card
  confirmCard: {
    marginHorizontal: 20,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#3d2c1e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  confirmCounselorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  avatarMd: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#f5efe6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmName: { fontSize: 17, fontWeight: '800', color: '#3d2c1e' },
  chip: { backgroundColor: '#f5f0e8', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  chipText: { fontSize: 11, color: '#5a4633', fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#f0ebe3', marginVertical: 12 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  priceLabel: { fontSize: 15, color: '#3d2c1e', fontWeight: '700' },
  priceValue: { fontSize: 22, color: '#3d2c1e', fontWeight: '900' },

  // Policy
  policyBox: {
    margin: 20,
    marginTop: 12,
    padding: 16,
    backgroundColor: '#f5f0e8',
    borderRadius: 12,
  },
  policyTitle: { fontSize: 12, fontWeight: '700', color: '#8c7b6b', marginBottom: 6, letterSpacing: 0.5 },
  policyText: { fontSize: 12, color: '#5a4633', lineHeight: 20 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 15, color: '#5a4633', fontWeight: '600' },

  // Bank transfer
  bankCard: {
    width: '100%', backgroundColor: '#ffffff', borderRadius: 16,
    padding: 20, marginBottom: 16,
    shadowColor: '#3d2c1e', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  bankCardTitle: { fontSize: 13, fontWeight: '800', color: '#8c7b6b', marginBottom: 14, letterSpacing: 0.5 },
  bankRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f5f0e8' },
  bankAmountRow: { borderBottomWidth: 0, marginTop: 4 },
  bankLabel: { fontSize: 14, color: '#8c7b6b', fontWeight: '500' },
  bankValue: { fontSize: 14, color: '#3d2c1e', fontWeight: '700' },
  bankAmount: { fontSize: 20, color: '#3d2c1e', fontWeight: '900' },

  noticeBox: {
    width: '100%', backgroundColor: '#fffbf0', borderRadius: 12,
    padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#f0c98a',
  },
  noticeText: { fontSize: 13, color: '#5a4633', lineHeight: 20 },

  // Complete
  completeCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#f0c98a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  completeTitle: { fontSize: 28, fontWeight: '900', color: '#3d2c1e', marginBottom: 10 },
  completeSub: {
    fontSize: 16,
    color: '#8c7b6b',
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 24,
  },
  completeSummaryCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#3d2c1e',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    backgroundColor: '#faf8f5',
    borderTopWidth: 1,
    borderTopColor: '#f0ebe3',
  },

  // Buttons
  primaryBtn: {
    backgroundColor: '#3d2c1e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { backgroundColor: '#c5b9ae' },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  secondaryBtn: {
    backgroundColor: '#f5f0e8',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: '#5a4633' },
  linkText: { fontSize: 13, color: '#8c7b6b', fontWeight: '500' },

});
