/**
 * Supabase Edge Function — get-livekit-token
 *
 * 인증된 이용자 또는 상담사에게 LiveKit 방 접속 토큰(JWT)을 발급합니다.
 *
 * - bookingId를 받아 해당 예약의 user_id 또는 counselor_id인지 검증
 * - 검증 통과 시 LIVEKIT_API_SECRET으로 서명된 JWT 반환
 * - 방 이름은 "todak-{bookingId}"로 고정 (LiveKit이 자동 생성)
 *
 * 환경변수:
 *   LIVEKIT_API_KEY           — LiveKit 프로젝트 API Key
 *   LIVEKIT_API_SECRET        — LiveKit 프로젝트 API Secret
 *   LIVEKIT_URL               — wss://xxx.livekit.cloud
 *   SUPABASE_URL              — 자동 주입
 *   SUPABASE_ANON_KEY         — 자동 주입
 *   SUPABASE_SERVICE_ROLE_KEY — 자동 주입
 *
 * 배포:
 *   supabase functions deploy get-livekit-token
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

// ─── LiveKit JWT 생성 (Web Crypto API — 외부 라이브러리 불필요) ───────────────

async function createLiveKitToken(
  apiKey: string,
  apiSecret: string,
  identity: string,
  participantName: string,
  roomName: string,
  ttlSeconds = 7200,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header  = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss:  apiKey,
    sub:  identity,
    iat:  now,
    nbf:  now,
    exp:  now + ttlSeconds,
    name: participantName,
    video: {
      roomJoin:       true,
      room:           roomName,
      canPublish:     true,
      canSubscribe:   true,
      canPublishData: true,
    },
  };

  // base64url 인코딩 (UTF-8 안전)
  const b64url = (obj: object) => {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    const bin   = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
    return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  };

  const signingInput = `${b64url(header)}.${b64url(payload)}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig    = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${signingInput}.${sigB64}`;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405);

  const LIVEKIT_API_KEY    = Deno.env.get('LIVEKIT_API_KEY');
  const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET');
  const LIVEKIT_URL        = Deno.env.get('LIVEKIT_URL');
  const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY  = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SVC_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    return json({ error: 'LiveKit 환경변수 미설정 (LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_URL)' }, 500);
  }

  // ── 요청 파싱 ─────────────────────────────────────────────────────────────
  let bookingId: string;
  try {
    const body = await req.json();
    bookingId = body.bookingId;
  } catch {
    return json({ error: '잘못된 요청 형식' }, 400);
  }
  if (!bookingId) return json({ error: 'bookingId 필수' }, 400);

  // ── 호출자 인증 (Supabase JWT) ────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser();
  if (authErr || !user) return json({ error: '인증 필요' }, 401);

  // ── 예약 조회 및 접근 권한 확인 ───────────────────────────────────────────
  const db = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);
  const { data: booking, error: bookingErr } = await db
    .from('bookings')
    .select(`
      id, user_id, counselor_id, status,
      users!bookings_user_id_fkey(name),
      counselors!bookings_counselor_id_fkey(users(name))
    `)
    .eq('id', bookingId)
    .single();

  if (bookingErr || !booking) return json({ error: '예약을 찾을 수 없어요' }, 404);

  const isUser      = booking.user_id === user.id;
  const isCounselor = booking.counselor_id === user.id;
  if (!isUser && !isCounselor) return json({ error: '접근 권한이 없어요' }, 403);

  // ── 참여자 이름 결정 ──────────────────────────────────────────────────────
  const participantName = isUser
    ? ((booking.users as any)?.name ?? '이용자')
    : ((booking.counselors as any)?.users?.name ?? '상담사');

  // ── LiveKit 토큰 발급 ─────────────────────────────────────────────────────
  const roomName = `todak-${bookingId}`;
  const token = await createLiveKitToken(
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
    user.id,
    participantName,
    roomName,
  );

  return json({ token, wsUrl: LIVEKIT_URL, roomName });
});
