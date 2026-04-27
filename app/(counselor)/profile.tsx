import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator,
  Alert, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/stores/authStore';
import {
  getCounselorDetail,
  updateCounselorProfile,
  updateUserProfile,
  uploadAvatarPhoto,
} from '@/lib/supabase';
import { Counselor, Specialty } from '@/types';

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

const SPECIALTIES: Specialty[] = ['직장', '연애', '가족', '진로'];
const SPECIALTY_EMOJI: Record<Specialty, string> = {
  '직장': '💼', '연애': '💛', '가족': '🏠', '진로': '🌱',
};

const AVATARS = ['🎧','👂','💬','🌿','☕','🌸','🌟','🧠','💙','🌈','🎵','🌻','🦋','🍀','🌙'];

const BANKS = [
  '국민은행', '신한은행', '하나은행', 'IBK기업은행',
  '우리은행', 'NH농협은행', '카카오뱅크', '토스뱅크',
  '케이뱅크', '우체국', '새마을금고', '신협', '기타',
];

export default function ProfileScreen() {
  const { user, updateProfile } = useAuthStore();

  const [counselor, setCounselor] = useState<Counselor | null>(null);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // 편집 상태
  const [name, setName]             = useState('');
  const [avatar, setAvatar]         = useState('🎧');
  const [avatarUrl, setAvatarUrl]   = useState<string | null>(null);
  const [bio, setBio]               = useState('');
  const [specialty, setSpecialty]   = useState<Specialty[]>([]);
  const [hourlyRate, setHourlyRate] = useState('');
  const [bankName, setBankName]     = useState('');
  const [accountNo, setAccountNo]   = useState('');

  const [showBankPicker, setBankPicker] = useState(false);
  const [usePhoto, setUsePhoto]         = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    load();
  }, [user?.id]);

  async function load() {
    try {
      setLoading(true);
      const p = (await getCounselorDetail(user!.id)) as Counselor;
      setCounselor(p);
      setName(user?.name ?? '');
      setAvatar(user?.avatar_emoji ?? '🎧');
      const url = (user as any)?.avatar_url ?? null;
      setAvatarUrl(url);
      setUsePhoto(!!url);
      setBio(p?.bio ?? '');
      setSpecialty(p?.specialty ?? []);
      setHourlyRate(String(p?.hourly_rate ?? 19000));
      setBankName(p?.bank_name ?? '');
      setAccountNo(p?.account_number ?? '');
    } catch (e) {
      console.error('[프로필] 로드 실패:', e);
    } finally {
      setLoading(false);
    }
  }

  async function pickPhoto() {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '사진 접근 권한이 필요합니다.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;

    try {
      setUploadingPhoto(true);
      const publicUrl = await uploadAvatarPhoto(user!.id, uri);
      setAvatarUrl(publicUrl);
      setUsePhoto(true);
      // 즉시 users 테이블에도 저장
      await updateUserProfile(user!.id, { avatar_url: publicUrl });
      await updateProfile({ avatar_url: publicUrl } as any);
    } catch (e: any) {
      Alert.alert('업로드 실패', e?.message ?? '사진 업로드에 실패했습니다.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  function removePhoto() {
    setAvatarUrl(null);
    setUsePhoto(false);
  }

  function toggleSpecialty(s: Specialty) {
    setSpecialty(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  }

  async function save() {
    if (!user?.id) return;
    const rate = parseInt(hourlyRate.replace(/,/g, ''), 10);

    if (!name.trim()) {
      Alert.alert('입력 오류', '이름을 입력해주세요.');
      return;
    }
    if (specialty.length === 0) {
      Alert.alert('입력 오류', '전문 분야를 하나 이상 선택해주세요.');
      return;
    }
    if (isNaN(rate) || rate <= 0) {
      Alert.alert('입력 오류', '올바른 상담 요금을 입력해주세요.');
      return;
    }

    try {
      setSaving(true);

      const userPatch: any = { name: name.trim(), avatar_emoji: avatar };
      if (!usePhoto) userPatch.avatar_url = null;

      await Promise.all([
        updateUserProfile(user.id, userPatch),
        updateCounselorProfile(user.id, {
          bio: bio.trim() || null,
          specialty,
          hourly_rate: rate,
          bank_name:      bankName || null,
          account_number: accountNo || null,
        }),
      ]);

      await updateProfile({ name: name.trim(), avatar_emoji: avatar, avatar_url: usePhoto ? avatarUrl : null } as any);

      Alert.alert('저장 완료', '프로필이 업데이트되었습니다.');
    } catch (e: any) {
      console.error('[프로필 저장 실패]', e);
      Alert.alert('오류', e?.message ?? '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={C.brown} />
      </View>
    );
  }

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

        {/* ── 아바타 & 이름 ──────────────────────────────────── */}
        <View style={s.card}>
          {/* 프로필 사진 미리보기 */}
          <View style={s.avatarPreviewWrap}>
            {usePhoto && avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.avatarPhoto} />
            ) : (
              <View style={s.avatarEmojiCircle}>
                <Text style={s.avatarBig}>{avatar}</Text>
              </View>
            )}

            {/* 사진 변경 오버레이 */}
            <TouchableOpacity
              style={s.avatarOverlay}
              onPress={pickPhoto}
              activeOpacity={0.8}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto
                ? <ActivityIndicator size="small" color={C.white} />
                : <Text style={s.avatarOverlayText}>📷</Text>}
            </TouchableOpacity>
          </View>

          {/* 사진 제거 버튼 */}
          {usePhoto && avatarUrl && (
            <TouchableOpacity style={s.removePhotoBtn} onPress={removePhoto}>
              <Text style={s.removePhotoText}>사진 제거하고 이모지 사용</Text>
            </TouchableOpacity>
          )}

          {/* 이모지 선택 (사진 없을 때만 표시) */}
          {!usePhoto && (
            <>
              <Text style={s.fieldLabel}>아바타 이모지</Text>
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
            </>
          )}

          <View style={s.sep} />

          {/* 이름 */}
          <Text style={s.fieldLabel}>이름</Text>
          <TextInput
            style={s.input}
            value={name}
            onChangeText={setName}
            placeholder="표시 이름"
            placeholderTextColor={C.brownPale}
            returnKeyType="done"
          />
        </View>

        {/* ── 상담사 소개 ────────────────────────────────────── */}
        <Text style={s.sectionTitle}>상담사 소개</Text>
        <View style={s.card}>
          {/* 전문 분야 */}
          <Text style={s.fieldLabel}>전문 분야</Text>
          <View style={s.chipRow}>
            {SPECIALTIES.map(sp => {
              const on = specialty.includes(sp);
              return (
                <TouchableOpacity
                  key={sp}
                  style={[s.chip, on && s.chipOn]}
                  onPress={() => toggleSpecialty(sp)}
                  activeOpacity={0.75}
                >
                  <Text style={[s.chipText, on && s.chipTextOn]}>
                    {SPECIALTY_EMOJI[sp]} {sp}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.sep} />

          {/* 자기소개 */}
          <Text style={s.fieldLabel}>자기소개</Text>
          <TextInput
            style={[s.input, s.inputMulti]}
            value={bio}
            onChangeText={setBio}
            placeholder="이용자에게 보여질 소개글을 작성해주세요"
            placeholderTextColor={C.brownPale}
            multiline
            textAlignVertical="top"
            returnKeyType="default"
          />

          <View style={s.sep} />

          {/* 30분 요금 */}
          <Text style={s.fieldLabel}>30분 상담 요금 (원)</Text>
          <View style={s.inputRow}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              value={hourlyRate}
              onChangeText={v => setHourlyRate(v.replace(/[^0-9]/g, ''))}
              placeholder="예: 19000"
              placeholderTextColor={C.brownPale}
              keyboardType="number-pad"
              returnKeyType="done"
            />
            <Text style={s.unit}>원 / 30분</Text>
          </View>

          {/* 평점 (읽기 전용) */}
          {counselor && (
            <View style={s.statsRow}>
              <View style={s.statBox}>
                <Text style={s.statNum}>★ {counselor.rating.toFixed(1)}</Text>
                <Text style={s.statLabel}>평점</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statNum}>{counselor.review_count}</Text>
                <Text style={s.statLabel}>리뷰 수</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statNum}>{counselor.is_certified ? '✅' : '⏳'}</Text>
                <Text style={s.statLabel}>인증</Text>
              </View>
            </View>
          )}
        </View>

        {/* ── 정산 정보 ──────────────────────────────────────── */}
        <Text style={s.sectionTitle}>정산 정보</Text>
        <View style={s.card}>
          {/* 은행 선택 */}
          <Text style={s.fieldLabel}>은행</Text>
          <TouchableOpacity
            style={[s.input, s.pickerBtn]}
            onPress={() => setBankPicker(v => !v)}
            activeOpacity={0.8}
          >
            <Text style={bankName ? s.pickerText : s.pickerPlaceholder}>
              {bankName || '은행 선택'}
            </Text>
            <Text style={s.pickerArrow}>{showBankPicker ? '▲' : '▼'}</Text>
          </TouchableOpacity>

          {showBankPicker && (
            <View style={s.pickerList}>
              {BANKS.map(b => (
                <TouchableOpacity
                  key={b}
                  style={[s.pickerItem, bankName === b && s.pickerItemOn]}
                  onPress={() => { setBankName(b); setBankPicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.pickerItemText, bankName === b && s.pickerItemTextOn]}>
                    {b}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={s.sep} />

          {/* 계좌번호 */}
          <Text style={s.fieldLabel}>계좌번호</Text>
          <TextInput
            style={s.input}
            value={accountNo}
            onChangeText={v => setAccountNo(v.replace(/[^0-9\-]/g, ''))}
            placeholder="예: 123-456-789012"
            placeholderTextColor={C.brownPale}
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
          />

          <Text style={s.bankHint}>
            정산은 매월 말일 기준으로 익월 5일 이내에 입금됩니다
          </Text>
        </View>

        {/* ── 저장 버튼 ──────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.saveBtn, (saving || uploadingPhoto) && s.saveBtnOff]}
          onPress={save}
          disabled={saving || uploadingPhoto}
          activeOpacity={0.8}
        >
          {saving
            ? <ActivityIndicator size="small" color={C.cream} />
            : <Text style={s.saveBtnText}>프로필 저장</Text>}
        </TouchableOpacity>

        <View style={{ height: 36 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.cream },
  content: { padding: 16 },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cream },

  card: {
    backgroundColor: C.white,
    borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: C.brown, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: C.brownPale,
    letterSpacing: 0.5, textTransform: 'uppercase',
    marginBottom: 8, marginTop: 4,
  },

  sep: { height: 1, backgroundColor: C.sep, marginVertical: 14 },

  /* 아바타 */
  avatarPreviewWrap: {
    alignSelf: 'center', marginBottom: 12,
    position: 'relative', width: 88, height: 88,
  },
  avatarPhoto: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2.5, borderColor: C.gold,
  },
  avatarEmojiCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: C.goldBg,
    borderWidth: 2.5, borderColor: C.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarBig: { fontSize: 40 },
  avatarOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.brown,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.white,
  },
  avatarOverlayText: { fontSize: 14 },
  removePhotoBtn: { alignSelf: 'center', marginBottom: 12 },
  removePhotoText: { fontSize: 12, color: C.brownPale, textDecorationLine: 'underline' },

  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  emojiCell: {
    width: 42, height: 42, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.cream, borderWidth: 1.5, borderColor: 'transparent',
  },
  emojiCellOn:  { borderColor: C.gold, backgroundColor: C.goldBg },
  emojiText:    { fontSize: 22 },

  /* 입력 필드 */
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: C.brownPale,
    marginBottom: 6, letterSpacing: 0.3,
  },
  input: {
    backgroundColor: C.cream, borderRadius: 10,
    borderWidth: 1, borderColor: '#e8e0d4',
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: C.brown, marginBottom: 4,
  },
  inputMulti: { height: 96, paddingTop: 10 },
  inputRow:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unit:       { fontSize: 13, color: C.brownPale, marginBottom: 4 },

  /* 전문 분야 칩 */
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: C.cream, borderWidth: 1.5, borderColor: '#e8e0d4',
  },
  chipOn:       { backgroundColor: C.goldBg, borderColor: C.gold },
  chipText:     { fontSize: 13, fontWeight: '600', color: C.brownPale },
  chipTextOn:   { color: C.brown },

  /* 평점 통계 */
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  statBox: {
    flex: 1, backgroundColor: C.cream, borderRadius: 10,
    alignItems: 'center', paddingVertical: 10,
  },
  statNum:   { fontSize: 16, fontWeight: '800', color: C.brown },
  statLabel: { fontSize: 11, color: C.brownPale, marginTop: 2 },

  /* 은행 피커 */
  pickerBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pickerText:        { fontSize: 14, color: C.brown },
  pickerPlaceholder: { fontSize: 14, color: C.brownPale },
  pickerArrow:       { fontSize: 10, color: C.brownPale },
  pickerList: {
    backgroundColor: C.white, borderRadius: 10,
    borderWidth: 1, borderColor: C.sep,
    marginTop: 4, marginBottom: 4, overflow: 'hidden',
  },
  pickerItem: {
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: C.sep,
  },
  pickerItemOn:     { backgroundColor: C.goldBg },
  pickerItemText:   { fontSize: 14, color: C.brownLight },
  pickerItemTextOn: { color: C.brown, fontWeight: '700' },
  bankHint: { fontSize: 11, color: C.brownPale, marginTop: 10, lineHeight: 16 },

  /* 저장 버튼 */
  saveBtn: {
    backgroundColor: C.brown, borderRadius: 14, height: 50,
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
    shadowColor: C.brown, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 4,
  },
  saveBtnOff:  { backgroundColor: '#c8bdb0', shadowOpacity: 0 },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: C.cream, letterSpacing: 0.3 },
});
