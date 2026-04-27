/**
 * 위기 대응 알림 오버레이
 *
 * 이용자가 위기 키워드 입력 시 → Supabase Realtime INSERT 이벤트 →
 * 상담사 화면에 즉시 빨간 모달 표시
 *
 * crisis_alerts 테이블 INSERT는 채팅 Edge Function(또는 Client)에서 수행.
 * 해당 컴포넌트는 counselor의 모든 화면에 마운트되어 있어야 합니다.
 * → app/(counselor)/_layout.tsx에 삽입
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Animated,
  Platform,
} from 'react-native';
import { supabase } from '@/lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CrisisAlertRow {
  id: string;
  counselor_id: string;
  booking_id: string | null;
  user_message: string;
  handled_at: string | null;
  created_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CRISIS_HOTLINE = '15770199';   // 정신건강 위기상담전화
const SUICIDE_HOTLINE = '1393';      // 자살예방상담전화

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  counselorId: string;
}

export function CrisisAlert({ counselorId }: Props) {
  const [alerts, setAlerts] = useState<CrisisAlertRow[]>([]);
  const [current, setCurrent] = useState<CrisisAlertRow | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Subscribe to crisis_alerts ────────────────────────────────────────────
  useEffect(() => {
    if (!counselorId) return;

    // 미처리 알림 초기 조회
    supabase
      .from('crisis_alerts')
      .select('*')
      .eq('counselor_id', counselorId)
      .is('handled_at', null)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setAlerts(data as CrisisAlertRow[]);
          setCurrent(data[0] as CrisisAlertRow);
        }
      })
      .catch(console.error);

    // Realtime 구독
    const channel = supabase
      .channel(`crisis-${counselorId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crisis_alerts',
          filter: `counselor_id=eq.${counselorId}`,
        },
        (payload) => {
          const newAlert = payload.new as CrisisAlertRow;
          setAlerts((prev) => [...prev, newAlert]);
          // 현재 알림이 없으면 즉시 표시
          setCurrent((prev) => prev ?? newAlert);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [counselorId]);

  // ── Pulse animation when alert is shown ───────────────────────────────────
  useEffect(() => {
    if (!current) { pulseAnim.setValue(1); return; }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [current]);

  // ── Mark as handled + show next ───────────────────────────────────────────
  const handleDismiss = async (alertId: string) => {
    await supabase
      .from('crisis_alerts')
      .update({ handled_at: new Date().toISOString() })
      .eq('id', alertId)
      .catch(console.error);

    setAlerts((prev) => {
      const remaining = prev.filter((a) => a.id !== alertId);
      setCurrent(remaining[0] ?? null);
      return remaining;
    });
  };

  // ── Call hotline ──────────────────────────────────────────────────────────
  const callHotline = async (number: string, alertId: string) => {
    const url = `tel:${number}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    }
    await handleDismiss(alertId);
  };

  if (!current) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => { /* 물리 뒤로가기 막기 */ }}
    >
      <View style={s.overlay}>
        <Animated.View style={[s.card, { transform: [{ scale: pulseAnim }] }]}>

          {/* 상단 경고 띠 */}
          <View style={s.header}>
            <Text style={s.headerIcon}>🚨</Text>
            <Text style={s.headerTitle}>위기 징후 감지</Text>
            <View style={s.alertCount}>
              <Text style={s.alertCountText}>{alerts.length}</Text>
            </View>
          </View>

          {/* 감지된 메시지 */}
          <View style={s.messageBox}>
            <Text style={s.messageLabel}>감지된 메시지</Text>
            <Text style={s.messageText}>"{current.user_message}"</Text>
          </View>

          <Text style={s.guideText}>
            이용자가 위기 상황에 있을 수 있어요.{'\n'}
            아래 전화번호를 안내해주세요.
          </Text>

          {/* 핫라인 버튼들 */}
          <TouchableOpacity
            style={s.hotlineBtn}
            onPress={() => callHotline(CRISIS_HOTLINE, current.id)}
            activeOpacity={0.85}
          >
            <View style={s.hotlineBtnInner}>
              <View>
                <Text style={s.hotlineName}>정신건강 위기상담전화</Text>
                <Text style={s.hotlineNumber}>☎ 1577-0199</Text>
              </View>
              <Text style={s.callLabel}>안내하기 →</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.hotlineBtnSecondary}
            onPress={() => callHotline(SUICIDE_HOTLINE, current.id)}
            activeOpacity={0.85}
          >
            <View style={s.hotlineBtnInner}>
              <View>
                <Text style={[s.hotlineName, { color: '#8c7b6b' }]}>자살예방상담전화</Text>
                <Text style={[s.hotlineNumber, { color: '#5a4633' }]}>☎ 1393</Text>
              </View>
              <Text style={[s.callLabel, { color: '#8c7b6b' }]}>안내하기 →</Text>
            </View>
          </TouchableOpacity>

          {/* 처리 완료 버튼 */}
          <TouchableOpacity
            style={s.dismissBtn}
            onPress={() => handleDismiss(current.id)}
          >
            <Text style={s.dismissText}>처리 완료 — 이미 안내했어요</Text>
          </TouchableOpacity>

          {/* 대기 중인 알림 수 */}
          {alerts.length > 1 && (
            <Text style={s.pendingNote}>
              대기 중인 알림 {alerts.length - 1}건이 더 있어요
            </Text>
          )}

        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Keyword Detection (Client-side helper) ───────────────────────────────────
// 채팅 메시지 전송 전 호출하여 위기 키워드 감지 시 crisis_alerts에 INSERT

const CRISIS_KEYWORDS = [
  '죽고 싶', '죽고싶', '자살', '자해', '스스로 목숨',
  '살기 싫', '살기싫', '더 이상 못 살', '없어지고 싶',
  '사라지고 싶', '극단적', '힘들어 죽겠',
];

/**
 * 메시지에 위기 키워드가 포함된 경우 crisis_alerts에 INSERT.
 * 채팅 메시지 전송 시 호출하세요.
 *
 * @returns 위기 키워드 감지 여부
 */
export async function checkAndAlertCrisis(
  message: string,
  counselorId: string,
  bookingId?: string
): Promise<boolean> {
  const lowerMsg = message.toLowerCase();
  const detected = CRISIS_KEYWORDS.some((kw) => lowerMsg.includes(kw.toLowerCase()));

  if (!detected) return false;

  await supabase
    .from('crisis_alerts')
    .insert({
      counselor_id: counselorId,
      booking_id: bookingId ?? null,
      user_message: message.slice(0, 200), // 최대 200자 저장
      created_at: new Date().toISOString(),
    })
    .catch(console.error);

  return true;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    backgroundColor: '#1a0a0a',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#c62828',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#c62828',
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingTop: Platform.OS === 'ios' ? 14 : 14,
  },
  headerIcon: { fontSize: 22, marginRight: 10 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#ffffff', flex: 1 },
  alertCount: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertCountText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  messageBox: {
    margin: 16,
    marginBottom: 8,
    padding: 14,
    backgroundColor: 'rgba(198,40,40,0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(198,40,40,0.3)',
  },
  messageLabel: { fontSize: 10, fontWeight: '700', color: 'rgba(255,100,100,0.7)', marginBottom: 6, letterSpacing: 0.5 },
  messageText: { fontSize: 14, color: '#ffcdd2', lineHeight: 22, fontStyle: 'italic' },

  guideText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 20,
    textAlign: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
  },

  hotlineBtn: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#c62828',
    borderRadius: 14,
    padding: 16,
  },
  hotlineBtnSecondary: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: 14,
  },
  hotlineBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hotlineName: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginBottom: 4 },
  hotlineNumber: { fontSize: 20, fontWeight: '800', color: '#ffffff' },
  callLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },

  dismissBtn: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dismissText: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },

  pendingNote: {
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(255,100,100,0.6)',
    paddingBottom: 14,
  },
});
