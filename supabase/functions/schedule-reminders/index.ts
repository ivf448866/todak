/**
 * Supabase Edge Function — schedule-reminders
 *
 * pg_cron으로 매 5분마다 실행. 임박한 상담을 감지해 Expo 푸시 알림을 발송한다.
 *
 * 알림 종류 및 발송 시점:
 *   booking_1hr_user       — 상담 57~63분 전 → 이용자에게 1시간 전 알림
 *   booking_30min_counselor — 상담 27~33분 전 → 상담사에게 30분 전 알림
 *   booking_start_user     — 상담 ±3분      → 이용자에게 시작 알림
 *   booking_review_user    — 완료 후 최근 6분 이내 → 이용자에게 리뷰 요청
 *   education_reminder     — 7일 이내 미발송 상담사 대상 교육 독촉 알림
 *
 * 중복 방지: notification_log 테이블 UNIQUE(user_id, booking_id, type)
 *
 * 배포:
 *   supabase functions deploy schedule-reminders
 *
 * pg_cron 등록 (Supabase Dashboard > Database > Extensions > pg_cron 활성화 후):
 *   SELECT cron.schedule('reminder-cron', '*/5 * * * *',
 *     $$ SELECT net.http_post(
 *       url     := '<SUPABASE_URL>/functions/v1/schedule-reminders',
 *       headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>","Content-Type":"application/json"}'::jsonb,
 *       body    := '{}'::jsonb
 *     ); $$);
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPushBatch } from '../_shared/push.ts';
import type { PushMessage } from '../_shared/push.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

type NotifType =
  | 'booking_1hr_user'
  | 'booking_30min_counselor'
  | 'booking_start_user'
  | 'booking_review_user'
  | 'education_reminder';

interface BookingRow {
  id: string;
  user_id: string;
  counselor_id: string;
  scheduled_at: string;
  duration_minutes: number;
}

interface UserRow {
  id: string;
  name: string;
  expo_push_token: string | null;
}

// ─── CORS / Helpers ───────────────────────────────────────────────────────────

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const iso = (d: Date) => d.toISOString();

// ─── Main ─────────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SVC_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  const now = new Date();
  const after  = (m: number) => new Date(now.getTime() + m * 60_000);
  const before = (m: number) => new Date(now.getTime() - m * 60_000);

  const stats = { sent: 0, skipped: 0, errors: 0 };

  // ── 유틸: 알림 이미 발송됐는지 확인 ────────────────────────────────────────
  async function alreadySent(userId: string, bookingId: string | null, type: NotifType): Promise<boolean> {
    const q = db
      .from('notification_log')
      .select('id')
      .eq('user_id', userId)
      .eq('type', type);
    if (bookingId) q.eq('booking_id', bookingId);
    const { data } = await q.maybeSingle();
    return !!data;
  }

  // ── 유틸: 로그 기록 ─────────────────────────────────────────────────────────
  async function logNotif(userId: string, bookingId: string | null, type: NotifType): Promise<void> {
    await db.from('notification_log').insert({
      user_id:    userId,
      booking_id: bookingId,
      type,
    }).catch(() => {}); // UNIQUE 제약 충돌 시 무시
  }

  // ── 공통: 예약 목록 + 관련 사용자 토큰 일괄 조회 ───────────────────────────
  async function fetchBookingsWithTokens(
    from: Date,
    to: Date,
    statuses: string[],
  ): Promise<{ booking: BookingRow; userRow: UserRow | undefined; counselorRow: UserRow | undefined }[]> {
    const { data: bookings } = await db
      .from('bookings')
      .select('id, user_id, counselor_id, scheduled_at, duration_minutes')
      .in('status', statuses)
      .gte('scheduled_at', iso(from))
      .lte('scheduled_at', iso(to));

    if (!bookings?.length) return [];

    const allIds = [...new Set([
      ...bookings.map((b: BookingRow) => b.user_id),
      ...bookings.map((b: BookingRow) => b.counselor_id),
    ])];

    const { data: users } = await db
      .from('users')
      .select('id, name, expo_push_token')
      .in('id', allIds);

    const userMap = new Map<string, UserRow>(
      (users ?? []).map((u: UserRow) => [u.id, u])
    );

    return (bookings as BookingRow[]).map(b => ({
      booking:       b,
      userRow:       userMap.get(b.user_id),
      counselorRow:  userMap.get(b.counselor_id),
    }));
  }

  try {
    const messages: PushMessage[] = [];
    type LogEntry = { userId: string; bookingId: string | null; type: NotifType };
    const logs: LogEntry[] = [];

    // ═══════════════════════════════════════════════════════════════════════
    // 1. 이용자 — 상담 1시간 전 알림 (57~63분 전)
    // ═══════════════════════════════════════════════════════════════════════
    {
      const items = await fetchBookingsWithTokens(after(57), after(63), ['confirmed']);
      for (const { booking, userRow, counselorRow } of items) {
        if (!userRow?.expo_push_token) { stats.skipped++; continue; }
        if (await alreadySent(booking.user_id, booking.id, 'booking_1hr_user')) { stats.skipped++; continue; }

        const counselorName = counselorRow?.name ?? '상담사';
        messages.push({
          to:    userRow.expo_push_token,
          title: '상담 1시간 전이에요 ☕',
          body:  `${counselorName}님과의 상담을 준비해주세요`,
          data:  { type: 'booking_1hr', bookingId: booking.id },
        });
        logs.push({ userId: booking.user_id, bookingId: booking.id, type: 'booking_1hr_user' });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 2. 상담사 — 상담 30분 전 알림 (27~33분 전)
    // ═══════════════════════════════════════════════════════════════════════
    {
      const items = await fetchBookingsWithTokens(after(27), after(33), ['confirmed']);
      for (const { booking, userRow, counselorRow } of items) {
        if (!counselorRow?.expo_push_token) { stats.skipped++; continue; }
        if (await alreadySent(booking.counselor_id, booking.id, 'booking_30min_counselor')) { stats.skipped++; continue; }

        const userName = userRow?.name ?? '이용자';
        messages.push({
          to:    counselorRow.expo_push_token,
          title: '30분 후 상담이 있어요 📋',
          body:  `${userName}님과의 상담을 준비해주세요`,
          data:  { type: 'booking_30min', bookingId: booking.id },
        });
        logs.push({ userId: booking.counselor_id, bookingId: booking.id, type: 'booking_30min_counselor' });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 3. 이용자 — 상담 시작 알림 (±3분)
    // ═══════════════════════════════════════════════════════════════════════
    {
      const items = await fetchBookingsWithTokens(before(3), after(3), ['confirmed']);
      for (const { booking, userRow, counselorRow } of items) {
        if (!userRow?.expo_push_token) { stats.skipped++; continue; }
        if (await alreadySent(booking.user_id, booking.id, 'booking_start_user')) { stats.skipped++; continue; }

        const counselorName = counselorRow?.name ?? '상담사';
        messages.push({
          to:    userRow.expo_push_token,
          title: '상담이 시작됐어요 📱',
          body:  `${counselorName}님과의 상담에 입장해주세요`,
          data:  { type: 'booking_start', bookingId: booking.id },
        });
        logs.push({ userId: booking.user_id, bookingId: booking.id, type: 'booking_start_user' });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 4. 이용자 — 리뷰 요청 (최근 6분 이내 완료된 예약)
    // ═══════════════════════════════════════════════════════════════════════
    {
      const { data: completedBookings } = await db
        .from('bookings')
        .select('id, user_id')
        .eq('status', 'completed')
        .gte('updated_at', iso(before(6)))
        .lte('updated_at', iso(now));

      if (completedBookings?.length) {
        const userIds = (completedBookings as { id: string; user_id: string }[]).map(b => b.user_id);
        const { data: reviewUsers } = await db
          .from('users')
          .select('id, expo_push_token')
          .in('id', userIds);

        const reviewTokenMap = new Map(
          (reviewUsers ?? []).map((u: UserRow) => [u.id, u.expo_push_token])
        );

        for (const b of completedBookings as { id: string; user_id: string }[]) {
          const token = reviewTokenMap.get(b.user_id);
          if (!token) { stats.skipped++; continue; }
          if (await alreadySent(b.user_id, b.id, 'booking_review_user')) { stats.skipped++; continue; }

          messages.push({
            to:    token,
            title: '상담이 어떠셨나요? ⭐',
            body:  '솔직한 후기를 남겨주시면 상담사에게 큰 힘이 돼요',
            data:  { type: 'booking_review', bookingId: b.id },
          });
          logs.push({ userId: b.user_id, bookingId: b.id, type: 'booking_review_user' });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 5. 상담사 — 교육 독촉 알림 (7일 이내 미발송 + 미인증 + 미완료 과정 보유)
    // ═══════════════════════════════════════════════════════════════════════
    {
      // 미인증 상담사 조회 (is_certified = false)
      const { data: uncertified } = await db
        .from('counselors')
        .select('id')
        .eq('is_certified', false);

      if (uncertified?.length) {
        const counselorIds = (uncertified as { id: string }[]).map(c => c.id);

        // 최근 7일 내 교육 알림 발송 이력이 없는 상담사 필터
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
        const { data: recentLogs } = await db
          .from('notification_log')
          .select('user_id')
          .in('user_id', counselorIds)
          .eq('type', 'education_reminder')
          .gte('sent_at', iso(sevenDaysAgo));

        const alreadyNotified = new Set(
          (recentLogs ?? []).map((r: { user_id: string }) => r.user_id)
        );

        const toNotify = counselorIds.filter(id => !alreadyNotified.has(id));
        if (toNotify.length) {
          const { data: eduUsers } = await db
            .from('users')
            .select('id, expo_push_token')
            .in('id', toNotify);

          for (const u of (eduUsers ?? []) as UserRow[]) {
            if (!u.expo_push_token) { stats.skipped++; continue; }
            messages.push({
              to:    u.expo_push_token,
              title: '필수 교육을 완료해주세요 📚',
              body:  '인증 상담사가 되려면 필수 과정을 모두 이수해야 해요',
              data:  { type: 'education_reminder' },
            });
            logs.push({ userId: u.id, bookingId: null, type: 'education_reminder' });
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 일괄 발송 + 로그 기록
    // ═══════════════════════════════════════════════════════════════════════
    await sendPushBatch(messages);
    stats.sent = messages.length;

    if (logs.length) {
      await db.from('notification_log').insert(
        logs.map(l => ({ user_id: l.userId, booking_id: l.bookingId, type: l.type }))
      ).catch(() => {}); // 중복 삽입 무시
    }

    console.log(`알림 발송 완료:`, stats);
    return json({ success: true, stats });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '알림 처리 실패';
    console.error('schedule-reminders error:', message);
    return json({ success: false, error: message }, 500);
  }
});
