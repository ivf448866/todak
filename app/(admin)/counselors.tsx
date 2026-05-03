import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, Switch, TextInput,
  Platform, Modal, KeyboardAvoidingView,
} from 'react-native';
import {
  adminGetAllCounselors, adminToggleCounselorCertification,
  adminToggleCounselorAvailability, updateCounselorProfile, updateUserProfile,
} from '@/lib/supabase';
import { Specialty } from '@/types';

const C = {
  bg: '#faf8f5', brown: '#3d2c1e', gold: '#f0c98a',
  pale: '#8c7b6b', white: '#ffffff', admin: '#1e293b',
  green: '#16a34a', red: '#dc2626', border: '#e8e0d5',
  cream: '#faf8f5',
} as const;

const SPECIALTIES: Specialty[] = ['직장', '연애', '가족', '진로'];
const SPECIALTY_EMOJI: Record<Specialty, string> = {
  '직장': '💼', '연애': '💛', '가족': '🏠', '진로': '🌱',
};

interface CounselorRow {
  id: string;
  specialty: string[];
  bio: string | null;
  rating: number;
  review_count: number;
  is_available: boolean;
  is_certified: boolean;
  hourly_rate: number;
  users: { name: string; avatar_emoji: string | null; avatar_url: string | null } | null;
}

export default function AdminCounselors() {
  const [counselors, setCounselors] = useState<CounselorRow[]>([]);
  const [filtered, setFiltered]     = useState<CounselorRow[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [toggling, setToggling]     = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<CounselorRow | null>(null);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q ? counselors.filter((c) => (c.users?.name ?? '').toLowerCase().includes(q)) : counselors
    );
  }, [search, counselors]);

  async function load() {
    try {
      const data = await adminGetAllCounselors();
      setCounselors(data as CounselorRow[]);
      setFiltered(data as CounselorRow[]);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function toggleCertified(counselor: CounselorRow) {
    setToggling(counselor.id + '_cert');
    try {
      await adminToggleCounselorCertification(counselor.id, !counselor.is_certified);
      setCounselors((prev) =>
        prev.map((c) => c.id === counselor.id ? { ...c, is_certified: !c.is_certified } : c)
      );
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setToggling(null);
    }
  }

  async function toggleAvailable(counselor: CounselorRow) {
    setToggling(counselor.id + '_avail');
    try {
      await adminToggleCounselorAvailability(counselor.id, !counselor.is_available);
      setCounselors((prev) =>
        prev.map((c) => c.id === counselor.id ? { ...c, is_available: !c.is_available } : c)
      );
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setToggling(null);
    }
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.admin} size="large" /></View>;
  }

  return (
    <View style={s.root}>
      {/* 검색 */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.search}
          value={search}
          onChangeText={setSearch}
          placeholder="이름으로 검색..."
          placeholderTextColor={C.pale}
        />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <Text style={s.countText}>{filtered.length}명의 상담사</Text>

        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🎧</Text>
            <Text style={s.emptyText}>상담사가 없습니다.</Text>
          </View>
        ) : (
          filtered.map((counselor) => (
            <View key={counselor.id} style={s.card}>
              <View style={s.cardHeader}>
                <View style={s.avatar}>
                  <Text style={s.avatarEmoji}>{counselor.users?.avatar_emoji ?? '👤'}</Text>
                </View>
                <View style={s.cardInfo}>
                  <Text style={s.name}>{counselor.users?.name ?? '이름 없음'}</Text>
                  <Text style={s.meta}>
                    ★ {counselor.rating.toFixed(1)} · {counselor.review_count}개 리뷰 · {counselor.hourly_rate.toLocaleString()}원/30분
                  </Text>
                  {counselor.specialty.length > 0 ? (
                    <View style={s.tags}>
                      {counselor.specialty.map((sp) => (
                        <View key={sp} style={s.tag}><Text style={s.tagText}>{sp}</Text></View>
                      ))}
                    </View>
                  ) : (
                    <Text style={s.noSpecialty}>전문 분야 미설정</Text>
                  )}
                </View>
                <TouchableOpacity style={s.editBtn} onPress={() => setEditTarget(counselor)}>
                  <Text style={s.editBtnText}>편집</Text>
                </TouchableOpacity>
              </View>

              {/* 토글 섹션 */}
              <View style={s.toggleSection}>
                <ToggleRow
                  label="인증 상담사"
                  sublabel="인증 배지 표시"
                  value={counselor.is_certified}
                  loading={toggling === counselor.id + '_cert'}
                  onToggle={() => toggleCertified(counselor)}
                  activeColor={C.admin}
                />
                <View style={s.divider} />
                <ToggleRow
                  label="상담 가능"
                  sublabel="이용자에게 노출"
                  value={counselor.is_available}
                  loading={toggling === counselor.id + '_avail'}
                  onToggle={() => toggleAvailable(counselor)}
                  activeColor={C.green}
                />
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* 편집 모달 */}
      {editTarget && (
        <EditModal
          counselor={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setCounselors((prev) => prev.map((c) => c.id === updated.id ? updated : c));
            setEditTarget(null);
          }}
        />
      )}
    </View>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({
  counselor,
  onClose,
  onSaved,
}: {
  counselor: CounselorRow;
  onClose: () => void;
  onSaved: (updated: CounselorRow) => void;
}) {
  const [name, setName]           = useState(counselor.users?.name ?? '');
  const [bio, setBio]             = useState(counselor.bio ?? '');
  const [hourlyRate, setHourlyRate] = useState(String(counselor.hourly_rate));
  const [specialty, setSpecialty] = useState<Specialty[]>(counselor.specialty as Specialty[]);
  const [saving, setSaving]       = useState(false);

  function toggleSp(sp: Specialty) {
    setSpecialty((prev) =>
      prev.includes(sp) ? prev.filter((x) => x !== sp) : [...prev, sp]
    );
  }

  async function save() {
    const rate = parseInt(hourlyRate.replace(/,/g, ''), 10);
    if (!name.trim()) { Alert.alert('오류', '이름을 입력해주세요.'); return; }
    if (isNaN(rate) || rate <= 0) { Alert.alert('오류', '올바른 요금을 입력해주세요.'); return; }

    setSaving(true);
    try {
      await Promise.all([
        updateUserProfile(counselor.id, { name: name.trim() }),
        updateCounselorProfile(counselor.id, {
          bio:         bio.trim() || null,
          specialty,
          hourly_rate: rate,
        }),
      ]);
      onSaved({
        ...counselor,
        bio:         bio.trim() || null,
        specialty,
        hourly_rate: rate,
        users: { ...(counselor.users ?? { avatar_emoji: null, avatar_url: null }), name: name.trim() },
      });
      Alert.alert('완료', '상담사 프로필이 수정됐어요.');
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '저장에 실패했어요.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={m.header}>
          <TouchableOpacity onPress={onClose} style={m.closeBtn}>
            <Text style={m.closeBtnText}>취소</Text>
          </TouchableOpacity>
          <Text style={m.title}>상담사 프로필 편집</Text>
          <TouchableOpacity onPress={save} style={m.saveBtn} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color={C.white} />
              : <Text style={m.saveBtnText}>저장</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView style={m.scroll} contentContainerStyle={m.content} keyboardShouldPersistTaps="handled">
          <Text style={m.label}>이름</Text>
          <TextInput
            style={m.input}
            value={name}
            onChangeText={setName}
            placeholder="상담사 이름"
            placeholderTextColor={C.pale}
            returnKeyType="done"
          />

          <Text style={m.label}>전문 분야</Text>
          <View style={m.chips}>
            {SPECIALTIES.map((sp) => {
              const on = specialty.includes(sp);
              return (
                <TouchableOpacity
                  key={sp}
                  style={[m.chip, on && m.chipOn]}
                  onPress={() => toggleSp(sp)}
                  activeOpacity={0.75}
                >
                  <Text style={[m.chipText, on && m.chipTextOn]}>
                    {SPECIALTY_EMOJI[sp]} {sp}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={m.label}>자기소개</Text>
          <TextInput
            style={[m.input, m.inputMulti]}
            value={bio}
            onChangeText={setBio}
            placeholder="이용자에게 보여질 소개글"
            placeholderTextColor={C.pale}
            multiline
            textAlignVertical="top"
          />

          <Text style={m.label}>30분 상담 요금 (원)</Text>
          <View style={m.rateRow}>
            <TextInput
              style={[m.input, { flex: 1 }]}
              value={hourlyRate}
              onChangeText={(v) => setHourlyRate(v.replace(/[^0-9]/g, ''))}
              placeholder="예: 19000"
              placeholderTextColor={C.pale}
              keyboardType="number-pad"
              returnKeyType="done"
            />
            <Text style={m.unit}>원 / 30분</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── ToggleRow ────────────────────────────────────────────────────────────────

function ToggleRow({ label, sublabel, value, loading, onToggle, activeColor }: {
  label: string; sublabel: string; value: boolean;
  loading: boolean; onToggle: () => void; activeColor: string;
}) {
  return (
    <View style={t.row}>
      <View>
        <Text style={t.label}>{label}</Text>
        <Text style={t.sub}>{sublabel}</Text>
      </View>
      {loading
        ? <ActivityIndicator size="small" color={activeColor} />
        : <Switch
            value={value}
            onValueChange={onToggle}
            trackColor={{ false: '#d1d5db', true: activeColor }}
            thumbColor={C.white}
          />
      }
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const t = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  label: { fontSize: 14, fontWeight: '700', color: C.brown },
  sub:   { fontSize: 12, color: C.pale, marginTop: 1 },
});

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchWrap:  { padding: 16, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  search:      { backgroundColor: '#f7f4ef', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.brown, borderWidth: 1, borderColor: C.border },
  content:     { padding: 16, paddingBottom: 40 },
  countText:   { fontSize: 13, color: C.pale, fontWeight: '600', marginBottom: 12 },
  empty:       { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyIcon:   { fontSize: 40 },
  emptyText:   { color: C.pale, fontSize: 15 },
  card:        { backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: C.brown, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardHeader:  { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'flex-start' },
  avatar:      { width: 48, height: 48, borderRadius: 24, backgroundColor: '#f0ebe3', alignItems: 'center', justifyContent: 'center' },
  avatarEmoji: { fontSize: 24 },
  cardInfo:    { flex: 1, justifyContent: 'center', gap: 4 },
  name:        { fontSize: 16, fontWeight: '800', color: C.brown },
  meta:        { fontSize: 12, color: C.pale },
  tags:        { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  tag:         { backgroundColor: '#f0ebe3', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagText:     { fontSize: 11, color: C.pale, fontWeight: '600' },
  noSpecialty: { fontSize: 11, color: '#ef4444' },
  editBtn:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: C.admin },
  editBtnText: { fontSize: 12, fontWeight: '700', color: C.white },
  toggleSection: { backgroundColor: '#f7f4ef', borderRadius: 12, paddingHorizontal: 12 },
  divider:     { height: 1, backgroundColor: C.border },
});

const m = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 56 : 16, paddingBottom: 12, backgroundColor: C.admin },
  title:       { fontSize: 16, fontWeight: '700', color: C.white },
  closeBtn:    { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  closeBtnText:{ fontSize: 13, color: C.white },
  saveBtn:     { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: C.gold, minWidth: 50, alignItems: 'center' },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: C.brown },
  scroll:      { flex: 1, backgroundColor: C.bg },
  content:     { padding: 20, paddingBottom: 40 },
  label:       { fontSize: 12, fontWeight: '700', color: C.pale, letterSpacing: 0.3, marginBottom: 6, marginTop: 16 },
  input:       { backgroundColor: C.white, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: C.brown },
  inputMulti:  { height: 96, paddingTop: 10, textAlignVertical: 'top' },
  chips:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:        { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border },
  chipOn:      { backgroundColor: '#fffbf3', borderColor: C.gold },
  chipText:    { fontSize: 13, fontWeight: '600', color: C.pale },
  chipTextOn:  { color: C.brown },
  rateRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unit:        { fontSize: 13, color: C.pale },
});
