import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator,
  Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { getUserBookings, updateUserProfile } from '@/lib/supabase';

const C = {
  cream:      '#faf8f5',
  brown:      '#3d2c1e',
  brownLight: '#5a4633',
  brownPale:  '#8c7b6b',
  gold:       '#f0c98a',
  goldLight:  '#f5ddb5',
  goldBg:     '#fffbf3',
  white:      '#ffffff',
  sep:        '#f0ebe3',
  red:        '#ef4444',
} as const;

const AVATARS = ['🙋','😊','🌸','🌿','☕','🌙','🌈','🎵','💙','🦋','🍀','🌻','⭐','🎀','🐣'];

const STATUS_LABEL: Record<string, { text: string; color: string; bg: string }> = {
  pending:     { text: '대기 중',  color: '#f59e0b', bg: '#fef3c7' },
  confirmed:   { text: '확정',     color: '#3b82f6', bg: '#dbeafe' },
  in_progress: { text: '진행 중',  color: '#8b5cf6', bg: '#ede9fe' },
  completed:   { text: '완료',     color: '#16a34a', bg: '#dcfce7' },
  cancelled:   { text: '취소',     color: '#ef4444', bg: '#fee2e2' },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  const day = ['일','월','화','수','목','금','토'][d.getDay()];
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${mm}/${dd}(${day}) ${hh}:${min}`;
}

function webConfirm(msg: string): boolean {
  return Platform.OS === 'web' ? window.confirm(msg) : true;
}

export default function MyPageScreen() {
  const router = useRouter();
  const { user, logout, updateProfile } = useAuthStore();

  const [bookings, setBookings]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [editMode, setEditMode]   = useState(false);
  const [saving, setSaving]       = useState(false);

  const [name, setName]     = useState('');
  const [avatar, setAvatar] = useState('🙋');

  useEffect(() => {
    setName(user?.name ?? '');
    setAvatar(user?.avatar_emoji ?? '🙋');
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;
    load();
  }, [user?.id]);

  async function load() {
    try {
      setLoading(true);
      const data = await getUserBookings(user!.id);
      const sorted = (data ?? []).sort(
        (a: any, b: any) =>
          new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
      );
      setBookings(sorted.slice(0, 20));
    } catch (e) {
      console.error('[마이페이지] 예약 조회 실패:', e);
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    if (!user?.id || !name.trim()) return;
    try {
      setSaving(true);
      await updateUserProfile(user.id, { name: name.trim(), avatar_emoji: avatar });
      await updateProfile({ name: name.trim(), avatar_emoji: avatar });
      setEditMode(false);
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    const ok = Platform.OS === 'web'
      ? webConfirm('로그아웃 하시겠어요?')
      : await new Promise<boolean>(res =>
          Alert.alert('로그아웃', '정말 로그아웃 하시겠어요?', [
            { text: '취소', style: 'cancel', onPress: () => res(false) },
            { text: '로그아웃', style: 'destructive', onPress: () => res(true) },
          ])
        );
    if (!ok) return;
    await logout();
    router.replace('/login');
  }

  async function handleSwitchToCounselor() {
    const ok = Platform.OS === 'web'
      ? webConfirm('상담사 계정으로 전환하시겠어요?')
      : await new Promise<boolean>(res =>
          Alert.alert('상담사로 전환', '상담사 계정으로 로그인 화면으로 이동합니다.', [
            { text: '취소', style: 'cancel', onPress: () => res(false) },
            { text: '전환', onPress: () => res(true) },
          ])
        );
    if (!ok) return;
    await logout();
    router.replace('/login');
  }

  const completed = bookings.filter(b => b.status === 'completed').length;
  const upcoming  = bookings.filter(b => ['pending','confirmed','in_progress'].includes(b.status)).length;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={s.root}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── 프로필 카드 ───────────────────────────────────── */}
        <View style={s.profileCard}>
          {editMode ? (
            <>
              {/* 아바타 선택 */}
              <View style={s.emojiGrid}>
                {AVATARS.map(e => (
                  <TouchableOpacity
                    key={e}
                    style={[s.emojiCell, avatar === e && s.emojiCellOn]}
                    onPress={() => setAvatar(e)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.emojiText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 이름 입력 */}
              <TextInput
                style={s.nameInput}
                value={name}
                onChangeText={setName}
                placeholder="이름"
                placeholderTextColor={C.brownPale}
                returnKeyType="done"
                onSubmitEditing={saveProfile}
                autoFocus
              />

              <View style={s.editBtnRow}>
                <TouchableOpacity
                  style={s.cancelBtn}
                  onPress={() => {
                    setName(user?.name ?? '');
                    setAvatar(user?.avatar_emoji ?? '🙋');
                    setEditMode(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={s.cancelBtnText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, saving && s.saveBtnOff]}
                  onPress={saveProfile}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving
                    ? <ActivityIndicator size="small" color={C.cream} />
                    : <Text style={s.saveBtnText}>저장</Text>}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={s.avatarWrap}>
                <Text style={s.avatarBig}>{user?.avatar_emoji ?? '🙋'}</Text>
              </View>
              <Text style={s.profileName}>{user?.name ?? '이름 없음'}</Text>
              <View style={s.roleBadge}>
                <Text style={s.roleBadgeText}>🙋 이용자</Text>
              </View>
              <TouchableOpacity style={s.editBtn} onPress={() => setEditMode(true)} activeOpacity={0.7}>
                <Text style={s.editBtnText}>프로필 편집</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── 통계 ─────────────────────────────────────────── */}
        <View style={s.statsRow}>
          <View style={s.statBox}>
            <Text style={s.statNum}>{bookings.length}</Text>
            <Text style={s.statLabel}>전체 예약</Text>
          </View>
          <View style={[s.statBox, s.statBoxMid]}>
            <Text style={s.statNum}>{completed}</Text>
            <Text style={s.statLabel}>완료 상담</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statNum}>{upcoming}</Text>
            <Text style={s.statLabel}>예정 상담</Text>
          </View>
        </View>

        {/* ── 예약 내역 ─────────────────────────────────────── */}
        <Text style={s.sectionTitle}>예약 내역</Text>

        {loading ? (
          <View style={[s.card, { alignItems: 'center', paddingVertical: 28 }]}>
            <ActivityIndicator color={C.brown} />
          </View>
        ) : bookings.length === 0 ? (
          <View style={[s.card, s.empty]}>
            <Text style={s.emptyIcon}>📅</Text>
            <Text style={s.emptyTitle}>예약 내역이 없어요</Text>
            <TouchableOpacity
              style={s.emptyBtn}
              onPress={() => router.push('/(user)/home')}
              activeOpacity={0.8}
            >
              <Text style={s.emptyBtnText}>상담사 찾아보기</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.card}>
            {bookings.map((b, i) => {
              const st = STATUS_LABEL[b.status] ?? { text: b.status, color: C.brownPale, bg: C.cream };
              const counselorName  = (b.counselors as any)?.users?.name ?? b.counselors?.name ?? '상담사';
              const counselorEmoji = (b.counselors as any)?.users?.avatar_emoji ?? '🎧';
              return (
                <View key={b.id}>
                  {i > 0 && <View style={s.itemSep} />}
                  <View style={s.bookingRow}>
                    <View style={s.bookingAvatar}>
                      <Text style={{ fontSize: 20 }}>{counselorEmoji}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.bookingName}>{counselorName} 상담사</Text>
                      <Text style={s.bookingTime}>{fmtDate(b.scheduled_at)}</Text>
                      <Text style={s.bookingMeta}>
                        {b.duration_minutes}분 · ₩{b.amount.toLocaleString()}
                      </Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[s.statusText, { color: st.color }]}>{st.text}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── 설정 ─────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>계정</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.menuRow} onPress={handleSwitchToCounselor} activeOpacity={0.7}>
            <Text style={s.menuIcon}>🎧</Text>
            <Text style={s.menuText}>상담사로 전환</Text>
            <Text style={s.menuArrow}>›</Text>
          </TouchableOpacity>
          <View style={s.itemSep} />
          <TouchableOpacity style={s.menuRow} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={s.menuIcon}>🚪</Text>
            <Text style={[s.menuText, { color: C.red }]}>로그아웃</Text>
            <Text style={[s.menuArrow, { color: C.red }]}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.cream },
  content: { padding: 16, paddingTop: 8 },

  /* 프로필 카드 */
  profileCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: C.brown,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.goldBg,
    borderWidth: 2.5, borderColor: C.gold,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  avatarBig:   { fontSize: 40 },
  profileName: { fontSize: 20, fontWeight: '800', color: C.brown, marginBottom: 6 },
  roleBadge: {
    backgroundColor: '#eef2ff', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 3, marginBottom: 14,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '700', color: '#4338ca' },
  editBtn: {
    paddingHorizontal: 18, paddingVertical: 7,
    borderRadius: 10, backgroundColor: C.cream,
    borderWidth: 1, borderColor: '#e0d5c8',
  },
  editBtnText: { fontSize: 13, fontWeight: '700', color: C.brownLight },

  /* 프로필 편집 모드 */
  emojiGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 8, marginBottom: 14, justifyContent: 'center',
  },
  emojiCell: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.cream,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  emojiCellOn: { borderColor: C.gold, backgroundColor: C.goldBg },
  emojiText:   { fontSize: 24 },
  nameInput: {
    width: '100%',
    backgroundColor: C.cream,
    borderRadius: 10,
    borderWidth: 1, borderColor: '#e8e0d4',
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: C.brown,
    textAlign: 'center',
    marginBottom: 12,
  },
  editBtnRow: { flexDirection: 'row', gap: 8, width: '100%' },
  cancelBtn: {
    flex: 1, height: 42, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.cream, borderWidth: 1, borderColor: '#e0d5c8',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: C.brownPale },
  saveBtn: {
    flex: 1, height: 42, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.brown,
  },
  saveBtnOff:  { backgroundColor: '#c8bdb0' },
  saveBtnText: { fontSize: 14, fontWeight: '800', color: C.cream },

  /* 통계 */
  statsRow: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderRadius: 16, marginBottom: 16,
    shadowColor: C.brown,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  statBox: {
    flex: 1, alignItems: 'center', paddingVertical: 16,
  },
  statBoxMid: {
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: C.sep,
  },
  statNum:   { fontSize: 22, fontWeight: '900', color: C.brown, marginBottom: 2 },
  statLabel: { fontSize: 11, color: C.brownPale, fontWeight: '600' },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.brownPale,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },

  card: {
    backgroundColor: C.white,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: C.brown,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  itemSep: { height: 1, backgroundColor: C.sep, marginHorizontal: 16 },

  /* 예약 행 */
  bookingRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingHorizontal: 16, paddingVertical: 13,
  },
  bookingAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.cream,
    alignItems: 'center', justifyContent: 'center',
  },
  bookingName: { fontSize: 13, fontWeight: '700', color: C.brown, marginBottom: 2 },
  bookingTime: { fontSize: 12, color: C.brownLight, marginBottom: 1 },
  bookingMeta: { fontSize: 11, color: C.brownPale },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText:  { fontSize: 11, fontWeight: '700' },

  /* 빈 상태 */
  empty:       { alignItems: 'center', paddingVertical: 32 },
  emptyIcon:   { fontSize: 36, marginBottom: 8 },
  emptyTitle:  { fontSize: 14, color: C.brownPale, marginBottom: 16 },
  emptyBtn: {
    paddingHorizontal: 20, paddingVertical: 9,
    borderRadius: 10, backgroundColor: C.brown,
  },
  emptyBtnText: { fontSize: 13, fontWeight: '700', color: C.cream },

  /* 설정 메뉴 */
  menuRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 15, gap: 12,
  },
  menuIcon:  { fontSize: 18, width: 26, textAlign: 'center' },
  menuText:  { flex: 1, fontSize: 15, fontWeight: '600', color: C.brown },
  menuArrow: { fontSize: 20, color: C.brownPale, fontWeight: '300' },
});
