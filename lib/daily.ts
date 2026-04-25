/**
 * Daily.co 화상통화 관련 함수들
 * https://docs.daily.co/
 */

export interface DailyRoomConfig {
  roomName: string;
  properties?: {
    expire_seconds?: number;
    max_participants?: number;
    privacy?: 'public' | 'private';
    meeting_join_hook?: {
      urls: string[];
    };
  };
}

export interface DailyRoom {
  name: string;
  id: string;
  api_created: boolean;
  privacy: 'public' | 'private';
  owner_id?: string;
  created_at: string;
  url: string;
  config?: DailyRoomConfig['properties'];
}

/**
 * Daily.co API 헤더 생성
 */
function getDailyHeaders() {
  const apiKey = process.env.EXPO_PUBLIC_DAILY_API_KEY;
  if (!apiKey) {
    throw new Error('Daily.co API 키가 설정되지 않았습니다.');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

/**
 * 화상통화 룸 생성
 */
export async function createRoom(config: DailyRoomConfig): Promise<DailyRoom> {
  try {
    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: getDailyHeaders(),
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      throw new Error(`Failed to create room: ${response.statusText}`);
    }

    const data = await response.json();
    return data.room || data;
  } catch (error) {
    console.error('룸 생성 실패:', error);
    throw error;
  }
}

/**
 * 화상통화 룸 조회
 */
export async function getRoom(roomName: string): Promise<DailyRoom> {
  try {
    const response = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      headers: getDailyHeaders(),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('룸을 찾을 수 없습니다.');
      }
      throw new Error(`Failed to get room: ${response.statusText}`);
    }

    const data = await response.json();
    return data.room || data;
  } catch (error) {
    console.error('룸 조회 실패:', error);
    throw error;
  }
}

/**
 * 화상통화 룸 삭제
 */
export async function deleteRoom(roomName: string): Promise<void> {
  try {
    const response = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      method: 'DELETE',
      headers: getDailyHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to delete room: ${response.statusText}`);
    }
  } catch (error) {
    console.error('룸 삭제 실패:', error);
    throw error;
  }
}

/**
 * 세션 토큰 생성
 */
export async function createSessionToken(
  roomName: string,
  options?: {
    userName?: string;
    userID?: string;
    exp?: number;
    isOwner?: boolean;
    canAdmin?: boolean;
    canPresent?: boolean;
    canStream?: boolean;
  }
): Promise<string> {
  try {
    const response = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: getDailyHeaders(),
      body: JSON.stringify({
        room_name: roomName,
        user_name: options?.userName,
        user_id: options?.userID,
        exp: options?.exp || Math.floor(Date.now() / 1000) + 3600, // 1시간 유효
        is_owner: options?.isOwner || false,
        can_admin: options?.canAdmin || false,
        can_present: options?.canPresent || true,
        can_stream: options?.canStream || false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create token: ${response.statusText}`);
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('토큰 생성 실패:', error);
    throw error;
  }
}

/**
 * 화상통화 시작 URL 생성
 */
export async function generateRoomUrl(
  roomName: string,
  userName: string,
  isOwner: boolean = false
): Promise<string> {
  try {
    // 룸 존재 확인 및 생성
    let room: DailyRoom;
    try {
      room = await getRoom(roomName);
    } catch {
      // 룸이 없으면 생성
      room = await createRoom({
        roomName,
        properties: {
          privacy: 'private',
          max_participants: 2,
        },
      });
    }

    // 세션 토큰 생성
    const token = await createSessionToken(roomName, {
      userName,
      isOwner,
      canPresent: true,
    });

    // 룸 URL에 토큰 추가
    return `${room.url}?t=${token}`;
  } catch (error) {
    console.error('룸 URL 생성 실패:', error);
    throw error;
  }
}

/**
 * 녹화 시작
 */
export async function startRecording(roomName: string): Promise<string> {
  try {
    const response = await fetch(
      `https://api.daily.co/v1/rooms/${roomName}/recordings/start`,
      {
        method: 'POST',
        headers: getDailyHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to start recording: ${response.statusText}`);
    }

    const data = await response.json();
    return data.recordingId || data.id;
  } catch (error) {
    console.error('녹화 시작 실패:', error);
    throw error;
  }
}

/**
 * 녹화 중지
 */
export async function stopRecording(
  roomName: string,
  recordingId: string
): Promise<{ recordingId: string; downloadUrl: string }> {
  try {
    const response = await fetch(
      `https://api.daily.co/v1/rooms/${roomName}/recordings/${recordingId}/stop`,
      {
        method: 'POST',
        headers: getDailyHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to stop recording: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      recordingId: data.recordingId || recordingId,
      downloadUrl: data.downloadUrl || '',
    };
  } catch (error) {
    console.error('녹화 중지 실패:', error);
    throw error;
  }
}

export default {
  createRoom,
  getRoom,
  deleteRoom,
  createSessionToken,
  generateRoomUrl,
  startRecording,
  stopRecording,
};
