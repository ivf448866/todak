/**
 * Expo Push Notification API helper (Deno)
 *
 * Usage:
 *   import { sendPush, sendPushBatch } from '../_shared/push.ts';
 *
 * Expo Push API는 한 번에 최대 100개 메시지를 배치로 처리한다.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  channelId?: string;
  badge?: number;
}

export async function sendPush(msg: PushMessage): Promise<void> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sound: 'default',
        channelId: 'todak',
        ...msg,
      }),
    });
    if (!res.ok) {
      console.error('Expo push failed:', await res.text());
    }
  } catch (err) {
    console.warn('sendPush error:', err);
  }
}

export async function sendPushBatch(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100).map(m => ({
      sound: 'default',
      channelId: 'todak',
      ...m,
    }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.error('Expo push batch failed:', await res.text());
      }
    } catch (err) {
      console.warn('sendPushBatch error:', err);
    }
  }
}
