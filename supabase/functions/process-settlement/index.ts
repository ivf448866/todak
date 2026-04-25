/**
 * Supabase Edge Function — process-settlement
 *
 * 매주 월요일 00:00 UTC 자동 실행 (pg_cron).
 * 지난 주(월~일) 완료된 상담을 집계해 counselor별 정산 레코드를 생성한다.
 *
 * 정산 정책:
 *   - 이용자 결제금액의 62%를 경청사에게 지급 (플랫폼 수수료 38%)
 *   - 최소 정산 금액 10,000원 미만 → 정산 건너뜀
 *   - 같은 기간 중복 정산 방지 (UNIQUE 제약 + 사전 체크)
 *
 * 배포:
 *   supabase functions deploy process-settlement
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendPush } from '../_shared/push.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const NET_RATE       = 0.62;
const MIN_NET_AMOUNT = 10_000;

// ─── Types ───────────────────────────────────────────────────────────────────

interface BookingRow {
  counselor_id: string;
  amount: number;
}

interface CounselorRow {
  id: string;
  bank_name: string | null;
  account_number: string | null;
  expo_push_token: string | null;
  users: { name: string } | null;
}

interface SettlementResult {
  counselor_id: string;
  status: 'created' | 'skipped' | 'error';
  reason?: string;
  net_amount?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/** 'YYYY-MM-DD' 형식 반환 */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 지난 주 월요일 00:00 ~ 일요일 23:59:59 계산 */
function getLastWeekPeriod(): { periodStart: Date; periodEnd: Date } {
  const now = new Date();

  // 직전 일요일 23:59:59
  const periodEnd = new Date(now);
  const dow = periodEnd.getUTCDay(); // 0=Sun
  const daysToLastSunday = dow === 0 ? 0 : dow;
  periodEnd.setUTCDate(now.getUTCDate() - daysToLastSunday);
  periodEnd.setUTCHours(23, 59, 59, 999);

  // 직전 월요일 00:00:00 (6일 전)
  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(periodEnd.getUTCDate() - 6);
  periodStart.setUTCHours(0, 0, 0, 0);

  return { periodStart, periodEnd };
}


// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SVC_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  // ── 기간 계산 ─────────────────────────────────────────────────────────────
  const { periodStart, periodEnd } = getLastWeekPeriod();
  const periodStartStr = toDateStr(periodStart);
  const periodEndStr   = toDateStr(periodEnd);

  console.log(`정산 기간: ${periodStartStr} ~ ${periodEndStr}`);

  try {
    // ── 1. 기간 내 완료된 예약 조회 ─────────────────────────────────────────
    const { data: bookings, error: bookingsErr } = await db
      .from('bookings')
      .select('counselor_id, amount')
      .eq('status', 'completed')
      .gte('scheduled_at', periodStart.toISOString())
      .lte('scheduled_at', periodEnd.toISOString());

    if (bookingsErr) throw new Error(`예약 조회 실패: ${bookingsErr.message}`);
    if (!bookings || bookings.length === 0) {
      return json({ success: true, message: '정산할 예약 없음', period: { start: periodStartStr, end: periodEndStr }, results: [] });
    }

    // ── 2. 경청사별 집계 ──────────────────────────────────────────────────
    const grouped = new Map<string, { sessions: number; gross: number }>();
    for (const b of bookings as BookingRow[]) {
      const existing = grouped.get(b.counselor_id) ?? { sessions: 0, gross: 0 };
      grouped.set(b.counselor_id, {
        sessions: existing.sessions + 1,
        gross:    existing.gross + b.amount,
      });
    }

    // ── 3. 경청사 정보 일괄 조회 ──────────────────────────────────────────
    const counselorIds = [...grouped.keys()];
    const { data: counselors, error: counselorsErr } = await db
      .from('counselors')
      .select('id, bank_name, account_number, users(name)')
      .in('id', counselorIds);

    if (counselorsErr) throw new Error(`경청사 조회 실패: ${counselorsErr.message}`);

    const counselorMap = new Map<string, CounselorRow>(
      (counselors ?? []).map((c: CounselorRow) => [c.id, c])
    );

    // ── 4. 정산 레코드 생성 ───────────────────────────────────────────────
    const results: SettlementResult[] = [];

    for (const [counselorId, data] of grouped.entries()) {
      const netAmount  = Math.floor(data.gross * NET_RATE);
      const feeAmount  = data.gross - netAmount;
      const counselor  = counselorMap.get(counselorId);

      // 최소 금액 미달
      if (netAmount < MIN_NET_AMOUNT) {
        results.push({ counselor_id: counselorId, status: 'skipped', reason: 'below_minimum' });
        continue;
      }

      // 중복 정산 체크
      const { data: existing } = await db
        .from('settlements')
        .select('id')
        .eq('counselor_id', counselorId)
        .eq('period_start', periodStartStr)
        .eq('period_end', periodEndStr)
        .maybeSingle();

      if (existing) {
        results.push({ counselor_id: counselorId, status: 'skipped', reason: 'duplicate' });
        continue;
      }

      // 정산 INSERT
      const { error: insertErr } = await db
        .from('settlements')
        .insert({
          counselor_id:   counselorId,
          period_start:   periodStartStr,
          period_end:     periodEndStr,
          total_sessions: data.sessions,
          gross_amount:   data.gross,
          platform_fee:   feeAmount,
          net_amount:     netAmount,
          status:         'pending',
          bank_name:      counselor?.bank_name ?? null,
          account_number: counselor?.account_number ?? null,
        });

      if (insertErr) {
        console.error(`정산 INSERT 실패 [${counselorId}]:`, insertErr.message);
        results.push({ counselor_id: counselorId, status: 'error', reason: insertErr.message });
        continue;
      }

      results.push({ counselor_id: counselorId, status: 'created', net_amount: netAmount });

      // 푸시 알림
      // 앱에서 expo_push_token을 counselors 테이블에 저장한 경우 전송
      const token = (counselor as any)?.expo_push_token as string | undefined;
      if (token) {
        const name = (counselor?.users as any)?.name ?? '경청사';
        await sendPush({
          to:    token,
          title: '이번 주 정산이 완료됐어요 💰',
          body:  `${name}님, ${netAmount.toLocaleString()}원이 등록된 계좌로 입금 예정이에요`,
          data:  { type: 'settlement' },
        });
      }
    }

    const summary = {
      total:   results.length,
      created: results.filter(r => r.status === 'created').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors:  results.filter(r => r.status === 'error').length,
    };

    console.log('정산 완료:', summary);

    return json({
      success: true,
      period:  { start: periodStartStr, end: periodEndStr },
      summary,
      results,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '정산 처리 실패';
    console.error('process-settlement error:', message);
    return json({ success: false, error: message }, 500);
  }
});
