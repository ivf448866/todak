/**
 * Supabase Edge Function — post-payment
 *
 * 결제 완료 후 처리:
 *   1. TossPayments 결제 승인 (Secret Key 사용)
 *   2. Daily.co 화상 방 생성 (상담 시작 1시간 전 ~ 종료 후 만료)
 *   3. bookings 테이블 업데이트 (status=confirmed, payment_key, room_url)
 *   4. 실시간 변경으로 상담사에게 알림 전달 (Supabase Realtime 자동 트리거)
 *
 * 환경변수 (Supabase Dashboard > Settings > Edge Functions > Secrets):
 *   TOSS_SECRET_KEY       — 토스페이먼츠 시크릿 키 (test_sk_ / live_sk_)
 *   DAILY_API_KEY         — Daily.co API 키
 *   SUPABASE_URL          — 자동 주입
 *   SUPABASE_SERVICE_ROLE_KEY — 자동 주입
 *
 * 배포:
 *   supabase functions deploy post-payment
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPush } from '../_shared/push.ts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RequestBody {
  paymentKey: string;
  orderId: string;    // = bookingId
  amount: number;
  bookingId: string;
}

interface TossConfirmResponse {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  approvedAt: string;
}

interface DailyRoom {
  id: string;
  name: string;
  url: string;
  created_at: string;
}

// ─── CORS headers ─────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ── Env ──────────────────────────────────────────────────────────────────
  const TOSS_SECRET_KEY = Deno.env.get('TOSS_SECRET_KEY');
  const DAILY_API_KEY = Deno.env.get('DAILY_API_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!TOSS_SECRET_KEY) return json({ error: 'TOSS_SECRET_KEY 미설정' }, 500);
  if (!DAILY_API_KEY) return json({ error: 'DAILY_API_KEY 미설정' }, 500);

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: '잘못된 요청 형식' }, 400);
  }

  const { paymentKey, orderId, amount, bookingId } = body;
  if (!paymentKey || !orderId || !amount || !bookingId) {
    return json({ error: '필수 파라미터 누락 (paymentKey, orderId, amount, bookingId)' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // ── 1. TossPayments 결제 승인 ────────────────────────────────────────
    const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${btoa(`${TOSS_SECRET_KEY}:`)}`,
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });

    if (!tossRes.ok) {
      const tossErr = await tossRes.json().catch(() => ({}));
      throw new Error(
        (tossErr as Record<string, string>).message ?? `Toss 결제 승인 실패: ${tossRes.status}`
      );
    }

    const tossData: TossConfirmResponse = await tossRes.json();
    console.log('Toss confirm OK:', tossData.paymentKey, tossData.status);

    // ── 2. 상담 예약 시간 조회 (Daily 방 만료 시간 계산용) ──────────────
    const { data: bookingRow, error: bookingFetchError } = await supabase
      .from('bookings')
      .select('scheduled_at, duration_minutes')
      .eq('id', bookingId)
      .single();

    if (bookingFetchError) {
      console.error('booking 조회 실패:', bookingFetchError.message);
    }

    // 상담 종료 후 30분 여유 → Daily 방 만료
    const scheduledAt = bookingRow?.scheduled_at
      ? new Date(bookingRow.scheduled_at)
      : new Date();
    const durationMin = bookingRow?.duration_minutes ?? 50;
    const expiresAt = new Date(scheduledAt.getTime() + (durationMin + 30) * 60 * 1000);
    const expireUnix = Math.floor(expiresAt.getTime() / 1000);

    // ── 3. Daily.co 방 생성 ──────────────────────────────────────────────
    const roomName = `todak-${bookingId}`;
    let roomUrl: string | null = null;

    const dailyRes = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: roomName,
        properties: {
          exp: expireUnix,        // 상담 종료 30분 후 자동 만료
          max_participants: 2,    // 이용자 + 경청사
          enable_prejoin_ui: false,
          enable_knocking: false,
          privacy: 'private',
          enable_chat: true,
          enable_screenshare: false,
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    });

    if (dailyRes.ok) {
      const dailyData: DailyRoom = await dailyRes.json();
      roomUrl = dailyData.url;
      console.log('Daily room created:', roomName, roomUrl);
    } else {
      // 방 생성 실패는 치명적이지 않음 — 결제는 이미 완료됨
      const dailyErr = await dailyRes.text();
      console.error('Daily room 생성 실패:', dailyErr);
    }

    // ── 4. bookings 테이블 업데이트 ──────────────────────────────────────
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        payment_key: paymentKey,
        room_url: roomUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      // DB 업데이트 실패 — 결제는 완료됐으므로 에러 로그만
      console.error('booking 업데이트 실패:', updateError.message);
    }

    // ── 5. 경청사에게 신규 예약 푸시 알림 ─────────────────────────────────
    {
      const { data: booking } = await supabase
        .from('bookings')
        .select('counselor_id, scheduled_at, users!bookings_user_id_fkey(name)')
        .eq('id', bookingId)
        .single();

      if (booking) {
        const { data: counselorUser } = await supabase
          .from('users')
          .select('expo_push_token')
          .eq('id', booking.counselor_id)
          .single();

        if (counselorUser?.expo_push_token) {
          const schedDate = new Date(booking.scheduled_at);
          const dateLabel = `${schedDate.getMonth() + 1}/${schedDate.getDate()} ${String(schedDate.getHours()).padStart(2, '0')}:${String(schedDate.getMinutes()).padStart(2, '0')}`;
          const userName  = (booking.users as any)?.name ?? '이용자';

          await sendPush({
            to:    counselorUser.expo_push_token,
            title: '새 예약이 들어왔어요 🔔',
            body:  `${dateLabel} ${userName}님과의 상담이 예약됐어요`,
            data:  { type: 'new_booking', bookingId },
          });
        }
      }
    }

    return json({
      success: true,
      roomUrl,
      paymentKey: tossData.paymentKey,
      approvedAt: tossData.approvedAt,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '결제 처리 실패';
    console.error('post-payment error:', message);

    // 결제 승인 실패 시 booking을 cancelled로 롤백
    await supabase
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .catch(() => null);

    return json({ success: false, error: message }, 400);
  }
});
