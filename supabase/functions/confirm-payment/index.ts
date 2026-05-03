/**
 * Supabase Edge Function — confirm-payment
 *
 * 관리자가 계좌 입금을 확인한 뒤 예약을 승인합니다.
 *   1. 호출자가 admin인지 검증
 *   2. booking status → 'confirmed', room_url 세팅
 *   3. 이용자에게 예약 확정 푸시 알림
 *   4. 상담사에게 새 예약 푸시 알림
 *
 * 배포:
 *   supabase functions deploy confirm-payment
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPush } from '../_shared/push.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SVC_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // ── 호출자 인증 ────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) return json({ error: '인증 필요' }, 401);

  // ── admin 권한 확인 ────────────────────────────────────────────────────────
  const db = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);
  const { data: caller } = await db
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (caller?.role !== 'admin') return json({ error: '관리자 권한이 필요해요' }, 403);

  // ── 요청 파싱 ──────────────────────────────────────────────────────────────
  let bookingId: string;
  try {
    const body = await req.json();
    bookingId = body.bookingId;
  } catch {
    return json({ error: '잘못된 요청 형식' }, 400);
  }
  if (!bookingId) return json({ error: 'bookingId 필수' }, 400);

  // ── 예약 조회 ──────────────────────────────────────────────────────────────
  const { data: booking, error: bookingErr } = await db
    .from('bookings')
    .select(`
      id, user_id, counselor_id, scheduled_at, amount,
      users!bookings_user_id_fkey(name, expo_push_token),
      counselors!bookings_counselor_id_fkey(users(name, expo_push_token))
    `)
    .eq('id', bookingId)
    .single();

  if (bookingErr || !booking) return json({ error: '예약을 찾을 수 없어요' }, 404);

  // ── booking 확정 ───────────────────────────────────────────────────────────
  const roomName = `todak-${bookingId}`;
  const { error: updateErr } = await db
    .from('bookings')
    .update({
      status:     'confirmed',
      room_url:   roomName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId);

  if (updateErr) {
    console.error('booking 업데이트 실패:', updateErr.message);
    return json({ error: 'booking 업데이트 실패' }, 500);
  }

  // ── 예약 일시 포맷 ─────────────────────────────────────────────────────────
  const d = new Date(booking.scheduled_at);
  const dateLabel = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  const userName      = (booking.users as any)?.name ?? '이용자';
  const counselorName = (booking.counselors as any)?.users?.name ?? '상담사';
  const userToken     = (booking.users as any)?.expo_push_token;
  const counselorToken = (booking.counselors as any)?.users?.expo_push_token;

  // ── 이용자 푸시: 예약 확정 ─────────────────────────────────────────────────
  if (userToken) {
    await sendPush({
      to:    userToken,
      title: '예약이 확정됐어요 🎉',
      body:  `${dateLabel} ${counselorName} 상담사와의 상담이 확정됐어요`,
      data:  { type: 'booking_confirmed', bookingId },
    }).catch((e) => console.error('이용자 푸시 실패:', e));
  }

  // ── 상담사 푸시: 새 예약 ───────────────────────────────────────────────────
  if (counselorToken) {
    await sendPush({
      to:    counselorToken,
      title: '새 예약이 확정됐어요 🔔',
      body:  `${dateLabel} ${userName}님과의 상담이 예약됐어요`,
      data:  { type: 'new_booking', bookingId },
    }).catch((e) => console.error('상담사 푸시 실패:', e));
  }

  return json({ success: true, roomName });
});
