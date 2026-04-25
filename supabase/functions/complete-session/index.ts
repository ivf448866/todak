/**
 * Supabase Edge Function — complete-session
 *
 * 세션 종료 후 처리:
 *   1. booking.status → 'completed'
 *   2. reviews 테이블에 별점/리뷰 INSERT
 *   3. trigger_update_counselor_rating 트리거가 counselors.rating 자동 재계산
 *
 * 환경변수:
 *   SUPABASE_URL             — 자동 주입
 *   SUPABASE_SERVICE_ROLE_KEY — 자동 주입
 *
 * 배포:
 *   supabase functions deploy complete-session
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RequestBody {
  bookingId: string;
  rating: number;      // 1~5
  comment?: string | null;
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SVC_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  // ── Parse ─────────────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: '잘못된 요청 형식' }, 400);
  }

  const { bookingId, rating, comment } = body;

  if (!bookingId)                                     return json({ error: 'bookingId 필수' }, 400);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return json({ error: 'rating은 1~5 정수여야 합니다' }, 400);

  try {
    // ── 1. booking 상태 → completed ──────────────────────────────────────
    const { error: bookingErr } = await db
      .from('bookings')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (bookingErr) {
      console.error('booking update 실패:', bookingErr.message);
      // 치명적이지 않음 — 리뷰는 계속 진행
    }

    // ── 2. 중복 리뷰 확인 (booking_id UNIQUE 제약) ────────────────────────
    const { data: existing } = await db
      .from('reviews')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (existing) {
      // 이미 리뷰가 있으면 업데이트
      const { error: updateErr } = await db
        .from('reviews')
        .update({
          rating,
          comment: comment ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('booking_id', bookingId);

      if (updateErr) throw new Error(updateErr.message);
      return json({ success: true, action: 'updated' });
    }

    // ── 3. 신규 리뷰 INSERT ──────────────────────────────────────────────
    // trigger_update_counselor_rating 트리거가 자동으로 counselors.rating 재계산
    const { error: reviewErr } = await db
      .from('reviews')
      .insert({
        booking_id: bookingId,
        rating,
        comment: comment ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (reviewErr) throw new Error(reviewErr.message);

    return json({ success: true, action: 'created' });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '세션 완료 처리 실패';
    console.error('complete-session error:', message);
    return json({ success: false, error: message }, 500);
  }
});
