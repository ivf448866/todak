import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl, Platform,
} from 'react-native';
import { adminGetSettlements, adminUpdateSettlementStatus } from '@/lib/supabase';
import { Settlement, SettlementStatus } from '@/types';

const C = {
  bg: '#faf8f5', brown: '#3d2c1e', gold: '#f0c98a',
  pale: '#8c7b6b', white: '#ffffff', admin: '#1e293b',
  green: '#16a34a', red: '#dc2626', border: '#e8e0d5',
} as const;

type FilterTab = 'all' | 'pending' | 'paid';
const TABS: { value: FilterTab; label: string }[] = [
  { value: 'all',     label: '전체' },
  { value: 'pending', label: '미처리' },
  { value: 'paid',    label: '완료' },
];

interface SettlementRow extends Settlement {
  counselors?: { id: string; users?: { name: string } | null } | null;
}

export default function AdminSettlements() {
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [tab, setTab] = useState<FilterTab>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await adminGetSettlements();
      setSettlements(data as SettlementRow[]);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleMarkPaid(settlement: SettlementRow) {
    const doUpdate = async () => {
      setProcessing(settlement.id);
      try {
        await adminUpdateSettlementStatus(settlement.id, 'paid');
        setSettlements((prev) =>
          prev.map((s) => s.id === settlement.id ? { ...s, status: 'paid', settled_at: new Date().toISOString() } : s)
        );
      } catch (e: any) {
        Alert.alert('오류', e.message);
      } finally {
        setProcessing(null);
      }
    };

    const counselorName = settlement.counselors?.users?.name ?? '상담사';
    if (Platform.OS === 'web') {
      if (window.confirm(`${counselorName}님께 ₩${settlement.net_amount.toLocaleString()} 지급 처리하시겠어요?`)) doUpdate();
    } else {
      Alert.alert(
        '정산 처리',
        `${counselorName}님께 ₩${settlement.net_amount.toLocaleString()} 지급 처리하시겠어요?`,
        [
          { text: '취소', style: 'cancel' },
          { text: '처리', onPress: doUpdate },
        ]
      );
    }
  }

  const filtered = tab === 'all' ? settlements : settlements.filter((s) => s.status === tab);

  const totalPending = settlements
    .filter((s) => s.status === 'pending')
    .reduce((sum, s) => sum + s.net_amount, 0);

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.admin} size="large" /></View>;
  }

  return (
    <View style={s.root}>
      {/* 미처리 합계 배너 */}
      {totalPending > 0 && (
        <View style={s.banner}>
          <Text style={s.bannerText}>미처리 정산 합계</Text>
          <Text style={s.bannerAmount}>₩{totalPending.toLocaleString()}</Text>
        </View>
      )}

      {/* 필터 탭 */}
      <View style={s.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.value}
            style={[s.tabBtn, tab === t.value && s.tabBtnActive]}
            onPress={() => setTab(t.value)}
            activeOpacity={0.7}
          >
            <Text style={[s.tabText, tab === t.value && s.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <Text style={s.countText}>{filtered.length}건</Text>

        {filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>💰</Text>
            <Text style={s.emptyText}>정산 내역이 없습니다.</Text>
          </View>
        ) : (
          filtered.map((settlement) => (
            <SettlementCard
              key={settlement.id}
              settlement={settlement}
              isProcessing={processing === settlement.id}
              onMarkPaid={handleMarkPaid}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function SettlementCard({ settlement, isProcessing, onMarkPaid }: {
  settlement: SettlementRow;
  isProcessing: boolean;
  onMarkPaid: (s: SettlementRow) => void;
}) {
  const counselorName = settlement.counselors?.users?.name ?? '이름 없음';
  const isPaid = settlement.status === 'paid';
  const periodStart = new Date(settlement.period_start).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  const periodEnd   = new Date(settlement.period_end).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  const settledAt   = settlement.settled_at ? new Date(settlement.settled_at).toLocaleDateString('ko-KR') : null;

  return (
    <View style={[c.card, isPaid && c.cardPaid]}>
      <View style={c.cardHeader}>
        <View>
          <Text style={c.name}>{counselorName}</Text>
          <Text style={c.period}>{periodStart} ~ {periodEnd}</Text>
        </View>
        <View style={[c.statusBadge, isPaid ? c.statusBadgePaid : c.statusBadgePending]}>
          <Text style={[c.statusText, isPaid ? c.statusTextPaid : c.statusTextPending]}>
            {isPaid ? '완료' : '미처리'}
          </Text>
        </View>
      </View>

      <View style={c.amounts}>
        <AmountRow label="총 결제금액" value={settlement.gross_amount} />
        <AmountRow label="플랫폼 수수료" value={settlement.platform_fee} negative />
        <View style={c.divider} />
        <AmountRow label="지급액 (62%)" value={settlement.net_amount} highlight />
      </View>

      <View style={c.footer}>
        <Text style={c.sessions}>상담 {settlement.total_sessions}회</Text>
        {isPaid && settledAt && (
          <Text style={c.settledAt}>지급완료: {settledAt}</Text>
        )}
        {!isPaid && (
          <TouchableOpacity
            style={c.payBtn}
            onPress={() => onMarkPaid(settlement)}
            disabled={isProcessing}
            activeOpacity={0.8}
          >
            {isProcessing
              ? <ActivityIndicator size="small" color={C.white} />
              : <Text style={c.payBtnText}>지급 처리</Text>
            }
          </TouchableOpacity>
        )}
      </View>

      {settlement.bank_name && settlement.account_number && (
        <View style={c.bankInfo}>
          <Text style={c.bankText}>🏦 {settlement.bank_name} {settlement.account_number}</Text>
        </View>
      )}
    </View>
  );
}

function AmountRow({ label, value, negative, highlight }: {
  label: string; value: number; negative?: boolean; highlight?: boolean;
}) {
  return (
    <View style={c.amountRow}>
      <Text style={[c.amountLabel, highlight && c.amountLabelHL]}>{label}</Text>
      <Text style={[c.amountValue, negative && c.amountNeg, highlight && c.amountHL]}>
        {negative ? '-' : ''}₩{value.toLocaleString()}
      </Text>
    </View>
  );
}

const c = StyleSheet.create({
  card:              { backgroundColor: C.white, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: C.brown, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, gap: 12 },
  cardPaid:          { opacity: 0.75 },
  cardHeader:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name:              { fontSize: 16, fontWeight: '800', color: C.brown },
  period:            { fontSize: 12, color: C.pale, marginTop: 2 },
  statusBadge:       { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgePending:{ backgroundColor: '#fef9c3' },
  statusBadgePaid:   { backgroundColor: '#f0fdf4' },
  statusText:        { fontSize: 12, fontWeight: '700' },
  statusTextPending: { color: '#92400e' },
  statusTextPaid:    { color: C.green },
  amounts:           { backgroundColor: '#f7f4ef', borderRadius: 10, padding: 12, gap: 6 },
  amountRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountLabel:       { fontSize: 13, color: C.pale },
  amountLabelHL:     { color: C.brown, fontWeight: '700' },
  amountValue:       { fontSize: 13, color: C.brown, fontWeight: '600' },
  amountNeg:         { color: C.red },
  amountHL:          { fontSize: 15, fontWeight: '900', color: C.admin },
  divider:           { height: 1, backgroundColor: C.border },
  footer:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessions:          { fontSize: 13, color: C.pale },
  settledAt:         { fontSize: 12, color: C.green, fontWeight: '600' },
  payBtn:            { backgroundColor: C.admin, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, minWidth: 70, alignItems: 'center' },
  payBtnText:        { color: C.white, fontWeight: '700', fontSize: 13 },
  bankInfo:          { backgroundColor: '#f0f9ff', borderRadius: 8, padding: 10 },
  bankText:          { fontSize: 12, color: '#0369a1', fontWeight: '600' },
});

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: C.bg },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  banner:          { backgroundColor: C.admin, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bannerText:      { fontSize: 14, color: '#94a3b8', fontWeight: '600' },
  bannerAmount:    { fontSize: 20, color: C.gold, fontWeight: '900' },
  tabs:            { flexDirection: 'row', padding: 12, gap: 8, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBtn:          { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: '#f0ebe3' },
  tabBtnActive:    { backgroundColor: C.admin },
  tabText:         { fontSize: 13, fontWeight: '700', color: C.pale },
  tabTextActive:   { color: C.white },
  content:         { padding: 16, paddingBottom: 40 },
  countText:       { fontSize: 13, color: C.pale, fontWeight: '600', marginBottom: 12 },
  empty:           { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyIcon:       { fontSize: 40 },
  emptyText:       { color: C.pale, fontSize: 15 },
});
