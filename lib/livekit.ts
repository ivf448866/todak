/**
 * LiveKit 클라이언트 유틸리티
 *
 * 토큰 발급은 서버(Edge Function: get-livekit-token)에서만 처리합니다.
 * Secret Key가 클라이언트에 노출되지 않도록 여기서는 room 이름 헬퍼만 제공합니다.
 */

export function getLiveKitRoomName(bookingId: string): string {
  return `todak-${bookingId}`;
}
