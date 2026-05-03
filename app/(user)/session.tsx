/**
 * 화상/음성 상담 세션 화면 (LiveKit)
 *
 * 필수 패키지 설치:
 *   npx expo install @livekit/react-native @livekit/react-native-webrtc expo-av
 *
 * iOS  → cd ios && pod install
 * Android → app.json permissions 이미 포함 (CAMERA, RECORD_AUDIO)
 */
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  TextInput,
  ScrollView,
  Animated,
  Platform,
  StatusBar,
  KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

// LiveKit — native only
let Room: any        = null;
let RoomEvent: any   = {};
let Track: any       = {};
let VideoView: any   = () => null;
let AudioSession: any = {
  startAudioSession: async () => {},
  stopAudioSession:  async () => {},
};

if (Platform.OS !== 'web') {
  try {
    const lk     = require('@livekit/react-native');
    Room         = lk.Room;
    RoomEvent    = lk.RoomEvent;
    Track        = lk.Track;
    VideoView    = lk.VideoView;
    AudioSession = lk.AudioSession;
  } catch (e) {
    console.warn('LiveKit 모듈을 불러올 수 없어요:', e);
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase =
  | 'permission'   // 권한 요청 중
  | 'connecting'   // LiveKit 연결 중
  | 'waiting'      // 상담사 대기 중
  | 'active'       // 세션 진행 중
  | 'ending'       // 종료 확인 모달
  | 'reviewing'    // 리뷰 작성
  | 'ended';       // 완료

interface SessionParams {
  roomName: string;
  bookingId: string;
  counselorId: string;
  counselorName: string;
  counselorEmoji: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  bg: '#130e09',
  bgCard: '#1e1610',
  brown: '#3d2c1e',
  gold: '#f0c98a',
  goldLight: '#f5ddb5',
  white: '#ffffff',
  red: '#e53935',
  redBg: '#4e1515',
  greenDot: '#4caf50',
  textMuted: 'rgba(255,255,255,0.5)',
  textSub: 'rgba(255,255,255,0.75)',
  btnBg: 'rgba(255,255,255,0.12)',
  warning: '#f59e0b',
} as const;

const TOTAL_SECONDS = 50 * 60;
const WARN_10 = 600;
const WARN_5  = 300;

const WAVEFORM_TARGET = [0.35, 0.6, 0.85, 1, 0.85, 0.6, 0.35] as const;
const WAVEFORM_SPEED  = [380, 290, 220, 260, 220, 310, 400] as const;

// ─── Sub-components ───────────────────────────────────────────────────────────

function AudioWaveform({ active }: { active: boolean }) {
  const anims = useRef(
    Array.from({ length: 7 }, (_, i) => new Animated.Value(WAVEFORM_TARGET[i] * 0.3))
  ).current;

  useEffect(() => {
    const loops = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: active ? WAVEFORM_TARGET[i] : 0.15, duration: WAVEFORM_SPEED[i], useNativeDriver: true }),
          Animated.timing(anim, { toValue: active ? WAVEFORM_TARGET[i] * 0.25 : 0.15, duration: WAVEFORM_SPEED[i], useNativeDriver: true }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active]);

  return (
    <View style={wf.wrap}>
      {anims.map((anim, i) => (
        <Animated.View key={i} style={[wf.bar, { transform: [{ scaleY: anim }] }]} />
      ))}
    </View>
  );
}

const wf = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 60 },
  bar: { width: 5, height: 60, borderRadius: 3, backgroundColor: C.gold, transformOrigin: 'center' },
});

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} activeOpacity={0.7}>
          <Text style={{ fontSize: 38, opacity: n <= value ? 1 : 0.25 }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ControlButton({
  icon, label, active = true, danger = false, onPress, size = 'md',
}: {
  icon: string; label: string; active?: boolean; danger?: boolean; onPress: () => void; size?: 'md' | 'lg';
}) {
  const isLg = size === 'lg';
  return (
    <TouchableOpacity style={ctrl.wrap} onPress={onPress} activeOpacity={0.75}>
      <View style={[ctrl.btn, isLg && ctrl.btnLg, danger && ctrl.btnDanger, !active && ctrl.btnOff]}>
        <Text style={{ fontSize: isLg ? 26 : 22 }}>{icon}</Text>
      </View>
      <Text style={ctrl.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const ctrl = StyleSheet.create({
  wrap:      { alignItems: 'center', gap: 6 },
  btn:       { width: 56, height: 56, borderRadius: 28, backgroundColor: C.btnBg, alignItems: 'center', justifyContent: 'center' },
  btnLg:     { width: 68, height: 68, borderRadius: 34 },
  btnDanger: { backgroundColor: C.red },
  btnOff:    { backgroundColor: 'rgba(255,255,255,0.06)' },
  label:     { fontSize: 11, color: C.textMuted, fontWeight: '500' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SessionScreen() {
  const params = useLocalSearchParams<Record<keyof SessionParams, string>>();
  const { roomName, bookingId, counselorName, counselorEmoji } = params;
  const router = useRouter();
  const { user } = useAuthStore();

  // ── LiveKit state ─────────────────────────────────────────────────────────
  const roomRef          = useRef<any>(null);
  const [phase, setPhase]                   = useState<Phase>('permission');
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<any>(null);
  const [localVideoTrack,  setLocalVideoTrack]  = useState<any>(null);
  const [hasRemoteAudio,   setHasRemoteAudio]   = useState(false);
  const [isMicOn,    setIsMicOn]    = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);

  // ── Timer ─────────────────────────────────────────────────────────────────
  const [timeLeft, setTimeLeft]       = useState(TOTAL_SECONDS);
  const [isTimerWarn, setIsTimerWarn] = useState(false);
  const notified10 = useRef(false);
  const notified5  = useRef(false);

  // ── Review state ──────────────────────────────────────────────────────────
  const [rating,      setRating]      = useState(5);
  const [reviewText,  setReviewText]  = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  const timerColor = timeLeft <= WARN_5 ? C.warning : timeLeft <= WARN_10 ? C.goldLight : C.white;
  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Permission + join ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomName) {
      Alert.alert('오류', '방 정보가 없어요.', [{ text: '확인', onPress: () => router.back() }]);
      return;
    }
    requestPermissionsAndJoin();
    return () => { leaveRoom(); };
  }, []);

  const requestPermissionsAndJoin = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('마이크 권한 필요', '상담을 위해 마이크 권한이 필요해요.', [
          { text: '확인', onPress: () => router.back() },
        ]);
        return;
      }
      await joinRoom();
    } catch (err) {
      console.error('권한 요청 실패:', err);
    }
  };

  const joinRoom = async () => {
    setPhase('connecting');
    try {
      // 1. LiveKit 토큰 발급
      const { data, error } = await supabase.functions.invoke('get-livekit-token', {
        body: { bookingId },
      });
      if (error) throw new Error(error.message);

      const { token, wsUrl } = data as { token: string; wsUrl: string };

      // 2. 오디오 세션 시작 (iOS/Android)
      await AudioSession.startAudioSession();

      // 3. LiveKit Room 생성 및 이벤트 등록
      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.Connected, async () => {
        setPhase('waiting');
        // 마이크·카메라 활성화
        await room.localParticipant.setMicrophoneEnabled(true);
        await room.localParticipant.setCameraEnabled(true);
      });

      // 로컬 카메라 트랙 게시 완료 시
      room.on(RoomEvent.LocalTrackPublished, (pub: any) => {
        if (pub.source === Track.Source?.Camera || pub.kind === Track.Kind?.Video) {
          setLocalVideoTrack(pub.videoTrack ?? pub.track ?? null);
        }
      });

      room.on(RoomEvent.LocalTrackUnpublished, (pub: any) => {
        if (pub.source === Track.Source?.Camera || pub.kind === Track.Kind?.Video) {
          setLocalVideoTrack(null);
        }
      });

      // 원격 참여자(상담사) 입장
      room.on(RoomEvent.ParticipantConnected, (participant: any) => {
        if (!participant.isLocal) setPhase('active');
      });

      // 원격 트랙 구독
      room.on(RoomEvent.TrackSubscribed, (track: any) => {
        const isVideo = track.source === Track.Source?.Camera
          || track.kind === Track.Kind?.Video;
        const isAudio = track.source === Track.Source?.Microphone
          || track.kind === Track.Kind?.Audio;

        if (isVideo) { setRemoteVideoTrack(track); setPhase('active'); }
        if (isAudio) { setHasRemoteAudio(true); }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track: any) => {
        const isVideo = track.source === Track.Source?.Camera
          || track.kind === Track.Kind?.Video;
        const isAudio = track.source === Track.Source?.Microphone
          || track.kind === Track.Kind?.Audio;

        if (isVideo) setRemoteVideoTrack(null);
        if (isAudio) setHasRemoteAudio(false);
      });

      // 원격 참여자(상담사) 퇴장
      room.on(RoomEvent.ParticipantDisconnected, (participant: any) => {
        if (!participant.isLocal) {
          Alert.alert('알림', '상담사가 나갔어요.', [
            { text: '세션 종료', onPress: () => endSession(false) },
          ]);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        // 연결 해제됨 — cleanup은 leaveRoom()에서 처리
      });

      // 4. 연결
      await room.connect(wsUrl, token, { autoSubscribe: true });

    } catch (err: any) {
      console.error('LiveKit 연결 실패:', err);
      Alert.alert('연결 실패', err.message ?? '방에 입장할 수 없어요.', [
        { text: '확인', onPress: () => router.back() },
      ]);
    }
  };

  const leaveRoom = async () => {
    const room = roomRef.current;
    if (!room) return;
    roomRef.current = null;
    try {
      await room.disconnect();
      await AudioSession.stopAudioSession();
    } catch { /* ignore cleanup errors */ }
  };

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active') return;

    const id = setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 1;
        if (next === WARN_10 && !notified10.current) {
          notified10.current = true;
          Alert.alert('⏰ 알림', '10분 남았어요');
        }
        if (next <= WARN_5 && !notified5.current) {
          notified5.current = true;
          setIsTimerWarn(true);
        }
        if (next <= 0) { clearInterval(id); endSession(true); return 0; }
        return next;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [phase]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !isMicOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setIsMicOn(next);
  }, [isMicOn]);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !isCameraOn;
    await room.localParticipant.setCameraEnabled(next);
    setIsCameraOn(next);
    if (!next) setLocalVideoTrack(null);
  }, [isCameraOn]);

  // ── End session ───────────────────────────────────────────────────────────
  const endSession = useCallback(async (isAutoEnd = false) => {
    await leaveRoom();
    setPhase('reviewing');
  }, []);

  // ── Submit review ─────────────────────────────────────────────────────────
  const submitReview = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('complete-session', {
        body: { bookingId, rating, comment: reviewText.trim() || null },
      });
      if (error) throw error;
      setPhase('ended');
      router.replace('/(user)/home' as any);
    } catch (err: any) {
      Alert.alert('오류', err.message ?? '리뷰 등록에 실패했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  const skipReview = () => {
    setPhase('ended');
    router.replace('/(user)/home' as any);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  // ── Connecting / Permission ───────────────────────────────────────────────
  if (phase === 'permission' || phase === 'connecting') {
    return (
      <View style={[s.fill, s.centered, { backgroundColor: C.bg }]}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <Text style={{ fontSize: 44, marginBottom: 20 }}>{counselorEmoji ?? '🎧'}</Text>
        <Text style={{ fontSize: 16, color: C.textSub, fontWeight: '600', marginBottom: 8 }}>
          {counselorName ?? '상담사'}
        </Text>
        <Text style={{ fontSize: 13, color: C.textMuted }}>
          {phase === 'permission' ? '권한 확인 중…' : '연결 중…'}
        </Text>
        <ConnectingDots />
      </View>
    );
  }

  // ── Waiting ───────────────────────────────────────────────────────────────
  if (phase === 'waiting') {
    return (
      <View style={[s.fill, s.centered, { backgroundColor: C.bg }]}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <Text style={{ fontSize: 52, marginBottom: 20 }}>{counselorEmoji ?? '🎧'}</Text>
        <Text style={{ fontSize: 17, color: C.white, fontWeight: '700', marginBottom: 8 }}>
          {counselorName ?? '상담사'}
        </Text>
        <Text style={{ fontSize: 13, color: C.textMuted, marginBottom: 40 }}>
          상담사 입장을 기다리고 있어요…
        </Text>
        <ConnectingDots />
        <TouchableOpacity
          style={[s.pill, { marginTop: 32, backgroundColor: C.redBg }]}
          onPress={() => router.back()}
        >
          <Text style={{ color: '#ff6b6b', fontSize: 14, fontWeight: '600' }}>취소</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Review ────────────────────────────────────────────────────────────────
  if (phase === 'reviewing') {
    return (
      <View style={[s.fill, { backgroundColor: C.bg }]}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.reviewScroll} keyboardShouldPersistTaps="handled">
            <View style={s.reviewCircle}>
              <Text style={{ fontSize: 40 }}>🎧</Text>
            </View>

            <Text style={s.reviewTitle}>상담은 어떠셨나요?</Text>
            <Text style={s.reviewSub}>
              {counselorName ?? '상담사'} 상담사와의{'\n'}소중한 시간이었어요
            </Text>

            <View style={s.ratingWrap}>
              <StarPicker value={rating} onChange={setRating} />
              <Text style={s.ratingLabel}>
                {['', '별로예요', '아쉬웠어요', '괜찮았어요', '좋았어요', '최고예요'][rating]}
              </Text>
            </View>

            <TextInput
              style={s.reviewInput}
              placeholder="한줄 리뷰를 남겨주세요 (선택)"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={reviewText}
              onChangeText={setReviewText}
              maxLength={100}
              multiline
            />
            <Text style={s.charCount}>{reviewText.length}/100</Text>

            <TouchableOpacity
              style={[s.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={submitReview}
              disabled={submitting}
            >
              <Text style={s.submitBtnText}>{submitting ? '등록 중…' : '리뷰 등록하기'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={{ marginTop: 14, alignItems: 'center' }} onPress={skipReview}>
              <Text style={{ color: C.textMuted, fontSize: 13 }}>건너뛰기</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ── Active Session ────────────────────────────────────────────────────────
  const isVideoMode = remoteVideoTrack !== null;

  return (
    <View style={[s.fill, { backgroundColor: C.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── Remote Video (fullscreen) or Audio Background ── */}
      {isVideoMode ? (
        <VideoView
          track={remoteVideoTrack}
          objectFit="cover"
          style={StyleSheet.absoluteFillObject}
        />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, s.audioBg]}>
          <View style={s.avatarLarge}>
            <Text style={{ fontSize: 72 }}>{counselorEmoji ?? '🎧'}</Text>
          </View>
          <Text style={s.audioName}>{counselorName ?? '상담사'}</Text>
          <AudioWaveform active={hasRemoteAudio} />
        </View>
      )}

      {/* ── Overlays ── */}
      <View style={s.topGradient} pointerEvents="none" />
      <View style={s.botGradient} pointerEvents="none" />

      {/* ── Top Bar ── */}
      <View style={s.topBar}>
        <View style={s.topLeft}>
          <View style={s.onlinePill}>
            <View style={s.onlineDot} />
            <Text style={s.onlineText}>연결됨</Text>
          </View>
          <Text style={s.counselorNameText}>{counselorName ?? '상담사'}</Text>
        </View>
        <View style={[s.timerPill, isTimerWarn && s.timerPillWarn]}>
          <Text style={[s.timerText, { color: timerColor }]}>{formatTime(timeLeft)}</Text>
          {isTimerWarn && <Text style={{ fontSize: 12, marginLeft: 4 }}>⚠️</Text>}
        </View>
      </View>

      {/* ── Local Video PiP ── */}
      {isCameraOn && localVideoTrack && (
        <View style={s.pipContainer}>
          <VideoView
            track={localVideoTrack}
            objectFit="cover"
            mirror
            style={s.pipVideo}
          />
          <View style={s.pipBorder} />
        </View>
      )}

      {/* ── Bottom Controls ── */}
      <View style={s.controls}>
        <ControlButton
          icon={isMicOn ? '🎙' : '🔇'}
          label={isMicOn ? '음소거' : '음소거 해제'}
          active={isMicOn}
          onPress={toggleMic}
        />
        <ControlButton
          icon="📵"
          label="종료"
          danger
          size="lg"
          onPress={() => setPhase('ending')}
        />
        <ControlButton
          icon={isCameraOn ? '📷' : '📵'}
          label={isCameraOn ? '화면 끄기' : '화면 켜기'}
          active={isCameraOn}
          onPress={toggleCamera}
        />
      </View>

      {/* ── End Confirm Modal ── */}
      <Modal
        visible={phase === 'ending'}
        transparent
        animationType="fade"
        onRequestClose={() => setPhase('active')}
      >
        <View style={s.modalOverlay}>
          <View style={s.endModal}>
            <Text style={{ fontSize: 36, marginBottom: 12 }}>📵</Text>
            <Text style={s.endTitle}>상담을 종료할까요?</Text>
            <Text style={s.endSub}>
              {formatTime(timeLeft)} 남아 있어요{'\n'}종료 후 리뷰를 남길 수 있어요
            </Text>
            <TouchableOpacity style={s.endBtnPrimary} onPress={() => endSession(false)}>
              <Text style={s.endBtnPrimaryText}>상담 종료</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.endBtnSecondary} onPress={() => setPhase('active')}>
              <Text style={s.endBtnSecondaryText}>계속 상담하기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Connecting Dots ─────────────────────────────────────────────────────────

function ConnectingDots() {
  const anims = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    const loops = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 20 }}>
      {anims.map((anim, i) => (
        <Animated.View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.gold, opacity: anim }} />
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  fill:    { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  pill:    { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },

  audioBg: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  avatarLarge: {
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: '#2a1e14',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 2, borderColor: 'rgba(240,201,138,0.3)',
  },
  audioName: { fontSize: 22, fontWeight: '700', color: C.white, marginBottom: 24 },

  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 160, backgroundColor: 'transparent', opacity: 0.7 },
  botGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 160, backgroundColor: 'transparent', opacity: 0.7 },

  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  topLeft: { gap: 4 },
  onlinePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(76,175,80,0.2)',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4caf50', marginRight: 5 },
  onlineText: { fontSize: 11, color: '#81c784', fontWeight: '600' },
  counselorNameText: { fontSize: 18, fontWeight: '700', color: C.white },

  timerPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  timerPillWarn: { borderColor: 'rgba(245,158,11,0.5)' },
  timerText: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },

  pipContainer: {
    position: 'absolute', right: 16, bottom: 110,
    width: 108, height: 148, borderRadius: 14, overflow: 'hidden',
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8,
  },
  pipVideo:   { flex: 1 },
  pipBorder:  { position: 'absolute', inset: 0, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },

  controls: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly',
    paddingHorizontal: 24, paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 38 : 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 28 },
  endModal: {
    backgroundColor: '#1e1610', borderRadius: 24, padding: 28, alignItems: 'center', width: '100%',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  endTitle:           { fontSize: 20, fontWeight: '800', color: C.white, marginBottom: 8 },
  endSub:             { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  endBtnPrimary:      { width: '100%', backgroundColor: C.red, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10 },
  endBtnPrimaryText:  { fontSize: 15, fontWeight: '700', color: C.white },
  endBtnSecondary:    { width: '100%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  endBtnSecondaryText: { fontSize: 15, fontWeight: '600', color: C.textSub },

  reviewScroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: Platform.OS === 'ios' ? 80 : 48, paddingBottom: 48 },
  reviewCircle: {
    width: 104, height: 104, borderRadius: 52,
    backgroundColor: '#2a1e14', alignItems: 'center', justifyContent: 'center',
    marginBottom: 22, borderWidth: 2, borderColor: 'rgba(240,201,138,0.3)',
  },
  reviewTitle:  { fontSize: 24, fontWeight: '800', color: C.white, marginBottom: 8 },
  reviewSub:    { fontSize: 14, color: C.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  ratingWrap:   { alignItems: 'center', marginBottom: 28 },
  ratingLabel:  { fontSize: 14, color: C.gold, fontWeight: '600', marginTop: 10 },
  reviewInput: {
    width: '100%', minHeight: 90,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14, padding: 16, color: C.white, fontSize: 14,
    textAlignVertical: 'top', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', lineHeight: 22,
  },
  charCount:    { alignSelf: 'flex-end', marginTop: 4, fontSize: 11, color: C.textMuted, marginBottom: 24 },
  submitBtn:    { width: '100%', backgroundColor: C.gold, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: C.brown },
});
