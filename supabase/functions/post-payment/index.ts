/**
 * Supabase Edge Function — post-payment
 *
 * 결제 완료 후 처리:
 *   1. TossPayments 결제 승인 (Secret Key 사용)
 *   2. bookings 테이블 업데이트 (status=confirmed, payment_key, room_url=방이름)
 *   3. 상담사에게 푸시 알림
 *
 * LiveKit 방은 첫 번째 참여자가 입장할 때 자동 생성됩니다.
 * 방 이름은 "todak-{bookingId}" 형식으로 고정됩니다.
 *
 * 환경변수 (Supabase Dashboard > Settings > Edge Functions > Secrets):
 *   TOSS_SECRET_KEY           — 토스페이먼츠 시크릿 키
 *   SUPABASE_URL              — 자동 주입
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
  orderId: string;
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

// ─── CORS ────────────────────────────────────────────────────────────────────

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

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const TOSS_SECRET_KEY     = Deno.env.get('TOSS_SECRET_KEY');
  const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!TOSS_SECRET_KEY) return json({ error: 'TOSS_SECRET_KEY 미설정' }, 500);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: '잘못된 요청 형식' }, 400);
  }

  const { paymentKey, orderId, amount, bookingId } = body;
  if (!paymentKey || !orderId || !amount || !bookingId) {
    return json({ error: '필수 파라미터 누락' }, 400);
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
      const err = await tossRes.json().catch(() => ({}));
      throw new Error((err as any).message ?? `Toss 결제 승인 실패: ${tossRes.status}`);
    }

    const tossData: TossConfirmResponse = await tossRes.json();

    // ── 2. booking 업데이트 ──────────────────────────────────────────────
    // room_url 컬럼에 LiveKit 방 이름을 저장합니다.
    // 실제 방은 첫 참여자가 입장할 때 LiveKit이 자동 생성합니다.
    const roomName = `todak-${bookingId}`;

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        payment_key: paymentKey,
        room_url: roomName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updateError) {
      console.error('booking 업데이트 실패:', updateError.message);
    }

    // ── 3. 상담사 푸시 알림 ──────────────────────────────────────────────
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
        const d = new Date(booking.scheduled_at);
        const dateLabel = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        const userName  = (booking.users as any)?.name ?? '이용자';

        await sendPush({
          to:    counselorUser.expo_push_token,
          title: '새 예약이 들어왔어요 🔔',
          body:  `${dateLabel} ${userName}님과의 상담이 예약됐어요`,
          data:  { type: 'new_booking', bookingId },
        });
      }
    }

    return json({
      success: true,
      roomName,
      paymentKey: tossData.paymentKey,
      approvedAt: tossData.approvedAt,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '결제 처리 실패';
    console.error('post-payment error:', message);

    await supabase
      .from('bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .catch(() => null);

    return json({ success: false, error: message }, 400);
  }
});
