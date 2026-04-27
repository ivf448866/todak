/**
 * 토닥 클라이언트 알림 유틸리티
 *
 * 의존성 설치:
 *   npx expo install expo-notifications expo-device
 *
 * 사용 방법:
 *   1. 앱 시작 / 로그인 시 registerPushToken(user.id) 호출
 *   2. 로그아웃 시 clearPushToken(user.id) 호출
 *   3. 레이아웃 루트에서 setupNotificationResponseHandler() 호출
 *   4. 예약 확정 후 scheduleCounselingReminder(booking) 호출
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from './supabase';

// Expo Go(SDK 53+)에서는 원격 푸시가 제거됨 → 모듈 로드 자체를 건너뜀
const isExpoGo = Constants.appOwnership === 'expo';
const canUseNotifications = Platform.OS !== 'web' && !isExpoGo;

let Notifications: any = null;
let Device: any = null;
if (canUseNotifications) {
  try {
    Notifications = require('expo-notifications');
    Device        = require('expo-device');
  } catch {
    // 개발 빌드가 아닌 환경에서 모듈 없으면 무시
  }
}

// ─── 포그라운드 알림 표시 설정 ─────────────────────────────────────────────────

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge:  false,
    }),
  });
}

// ─── 권한 요청 & 토큰 등록 ────────────────────────────────────────────────────

export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web') return; // 웹에서는 VAPID 키 없이 푸시 불가
  if (!Device.isDevice) return; // 시뮬레이터에서는 푸시 불가

  // Android 알림 채널
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('todak', {
      name:              '토닥 알림',
      importance:        Notifications.AndroidImportance.MAX,
      vibrationPattern:  [0, 250, 250, 250],
      lightColor:        '#f0c98a',
      sound:             'default',
    });
  }

  // 권한 요청
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    const { status: requested } = await Notifications.requestPermissionsAsync();
    status = requested;
  }
  if (status !== 'granted') return;

  // Expo 푸시 토큰 발급 및 DB 저장
  const { data: token } = await Notifications.getExpoPushTokenAsync();
  await supabase
    .from('users')
    .update({ expo_push_token: token })
    .eq('id', userId)
    .then(({ error }) => {
      if (error) console.warn('[알림] 토큰 저장 실패:', error.message);
    });
}

/** 로그아웃 시 토큰 초기화 */
export async function clearPushToken(userId: string): Promise<void> {
  await supabase
    .from('users')
    .update({ expo_push_token: null })
    .eq('id', userId);
}

// ─── 알림 탭 핸들러 ───────────────────────────────────────────────────────────

/**
 * 알림 탭 시 해당 화면으로 이동.
 * 앱 루트 레이아웃(_layout.tsx)에서 useEffect로 호출하고 cleanup을 반환한다.
 */
export function setupNotificationResponseHandler(): () => void {
  if (!Notifications) return () => {};

  const sub = Notifications.addNotificationResponseReceivedListener((response: any) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    const type = data?.type as string | undefined;

    if (!type) return;

    switch (type) {
      case 'new_booking':
        router.push('/(counselor)/schedule');
        break;
      case 'booking_1hr':
      case 'booking_start':
      case 'booking_review':
        break;
      case 'settlement':
        router.push('/(counselor)/stats');
        break;
      case 'education_reminder':
        router.push('/(counselor)/education');
        break;
    }
  });

  return () => sub.remove();
}

// ─── 로컬 알림 스케줄링 ────────────────────────────────────────────────────────

/**
 * 이용자용: 상담 1시간 전 로컬 알림 스케줄 등록.
 * post-payment 완료 직후 호출한다.
 *
 * @returns 스케줄 ID (취소 시 사용) 또는 null (이미 지난 시간)
 */
export async function scheduleCounselingReminder(booking: {
  id: string;
  scheduled_at: string;
  counselor_name: string;
}): Promise<string | null> {
  if (!Notifications) return null;

  const trigger = new Date(booking.scheduled_at);
  trigger.setMinutes(trigger.getMinutes() - 60);
  if (trigger <= new Date()) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: '상담 1시간 전이에요 ☕',
      body:  `${booking.counselor_name}님과의 상담을 준비해주세요`,
      sound: 'default',
      data:  { type: 'booking_1hr', bookingId: booking.id },
    },
    trigger,
  });
}

/** 예약 취소 시 관련 로컬 알림 제거 */
export async function cancelScheduledReminder(bookingId: string): Promise<void> {
  if (!Notifications) return;

  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if ((n.content.data as Record<string, unknown>)?.bookingId === bookingId) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}
