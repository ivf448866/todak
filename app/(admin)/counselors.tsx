import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, Switch, TextInput, Platform,
} from 'react-native';
import { adminGetAllCounselors, adminToggleCounselorCertification, adminToggleCounselorAvailability } from '@/lib/supabase';

const C = {
  bg: '#faf8f5', brown: '#3d2c1e', gold: '#f0c98a',
  pale: '#8c7b6b', white: '#ffffff', admin: '#1e293b',
  green: '#16a34a', red: '#dc2626', border: '#e8e0d5',
} as const;

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
  const [filtered, setFiltered] = useState<CounselorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);

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
                  <Text style={s.meta}>★ {counselor.rating.toFixed(1)} · {counselor.review_count}개 리뷰</Text>
                  {counselor.specialty.length > 0 && (
                    <View style={s.tags}>
                      {counselor.specialty.map((sp) => (
                        <View key={sp} style={s.tag}><Text style={s.tagText}>{sp}</Text></View>
                      ))}
                    </View>
                  )}
                </View>
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
    </View>
  );
}

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

const t = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  label: { fontSize: 14, fontWeight: '700', color: C.brown },
  sub:   { fontSize: 12, color: C.pale, marginTop: 1 },
});

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: C.bg },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchWrap:    { padding: 16, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  search:        { backgroundColor: '#f7f4ef', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: C.brown, borderWidth: 1, borderColor: C.border },
  content:       { padding: 16, paddingBottom: 40 },
  countText:     { fontSize: 13, color: C.pale, fontWeight: '600', marginBottom: 12 },
  empty:         { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyIcon:     { fontSize: 40 },
  emptyText:     { color: C.pale, fontSize: 15 },
  card:          { backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: C.brown, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardHeader:    { flexDirection: 'row', gap: 12, marginBottom: 12 },
  avatar:        { width: 48, height: 48, borderRadius: 24, backgroundColor: '#f0ebe3', alignItems: 'center', justifyContent: 'center' },
  avatarEmoji:   { fontSize: 24 },
  cardInfo:      { flex: 1, justifyContent: 'center', gap: 4 },
  name:          { fontSize: 16, fontWeight: '800', color: C.brown },
  meta:          { fontSize: 12, color: C.pale },
  tags:          { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  tag:           { backgroundColor: '#f0ebe3', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagText:       { fontSize: 11, color: C.pale, fontWeight: '600' },
  toggleSection: { backgroundColor: '#f7f4ef', borderRadius: 12, paddingHorizontal: 12 },
  divider:       { height: 1, backgroundColor: C.border },
});
