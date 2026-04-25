/**
 * 경청사 수익 통계 화면
 *
 * - 이번 달 수익 요약 카드
 * - 최근 6개월 바 차트 (커스텀)
 * - 수익 구조 시각화 (수령액 62% vs 수수료 38%)
 * - 정산 내역 리스트 (이번달/지난달/전체 필터)
 * - 계좌 등록/수정 모달
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Settlement } from '@/types';

const { width: W } = Dimensions.get('window');

// ─── Constants ────────────────────────────────────────────────────────────────

const NET_RATE = 0.62;
const FEE_RATE = 0.38;
const CHART_H  = 160;

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  cream:      '#faf8f5',
  brown:      '#3d2c1e',
  brownLight: '#5a4633',
  brownPale:  '#8c7b6b',
  gold:       '#f0c98a',
  goldDark:   '#c8932a',
  goldBg:     '#fff8ec',
  white:      '#ffffff',
  green:      '#4caf50',
  greenBg:    '#e8f5e9',
  greenText:  '#2e7d32',
  divider:    '#f0ebe3',
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKRW(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}

function formatShort(n: number): string {
  if (n >= 10_000) return `${Math.floor(n / 10_000).toLocaleString()}만`;
  if (n >= 1_000)  return `${Math.floor(n / 1_000).toLocaleString()}천`;
  return String(n);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthlyStats {
  sessions:      number;
  grossAmount:   number;
  netAmount:     number;
  feeAmount:     number;
  pendingAmount: number;
}

type FilterPeriod = 'this_month' | 'last_month' | 'all';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StatsScreen() {
  const { user } = useAuthStore();

  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats>({
    sessions: 0, grossAmount: 0, netAmount: 0, feeAmount: 0, pendingAmount: 0,
  });
  const [settlements, setSettlements]   = useState<Settlement[]>([]);
  const [chartLabels, setChartLabels]   = useState<string[]>([]);
  const [chartValues, setChartValues]   = useState<number[]>([]);
  const [bankName, setBankName]         = useState<string | null>(null);
  const [accountNumber, setAccountNumber] = useState<string | null>(null);
  const [filter, setFilter]             = useState<FilterPeriod>('this_month');
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  // modal state
  const [showModal, setShowModal]     = useState(false);
  const [bankInput, setBankInput]     = useState('');
  const [accountInput, setAccountInput] = useState('');
  const [saving, setSaving]           = useState(false);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const now          = new Date();
      const sixMonthsAgo = startOfMonth(subMonths(now, 5));

      const [bookingsRes, settlementsRes, counselorRes] = await Promise.all([
        supabase
          .from('bookings')
          .select('amount')
          .eq('counselor_id', user.id)
          .eq('status', 'completed')
          .gte('scheduled_at', startOfMonth(now).toISOString())
          .lte('scheduled_at', endOfMonth(now).toISOString()),
        supabase
          .from('settlements')
          .select('*')
          .eq('counselor_id', user.id)
          .gte('period_start', format(sixMonthsAgo, 'yyyy-MM-dd'))
          .order('period_start', { ascending: false }),
        supabase
          .from('counselors')
          .select('bank_name, account_number')
          .eq('id', user.id)
          .single(),
      ]);

      // ── 이번 달 요약 ─────────────────────────────────────────────────────
      const bookings = (bookingsRes.data ?? []) as { amount: number }[];
      const gross    = bookings.reduce((s, b) => s + b.amount, 0);
      const net      = Math.floor(gross * NET_RATE);
      const fee      = gross - net;

      const raw = (settlementsRes.data ?? []) as Settlement[];

      const mStart      = format(startOfMonth(now), 'yyyy-MM-dd');
      const mEnd        = format(endOfMonth(now),   'yyyy-MM-dd');
      const settledNet  = raw
        .filter(s => s.period_start >= mStart && s.period_start <= mEnd)
        .reduce((s, r) => s + r.net_amount, 0);

      setMonthlyStats({
        sessions:      bookings.length,
        grossAmount:   gross,
        netAmount:     net,
        feeAmount:     fee,
        pendingAmount: Math.max(0, net - settledNet),
      });

      // ── 6개월 차트 ───────────────────────────────────────────────────────
      const labels: string[] = [];
      const values: number[] = [];
      for (let i = 5; i >= 0; i--) {
        const m    = subMonths(now, i);
        const ms   = format(startOfMonth(m), 'yyyy-MM-dd');
        const me   = format(endOfMonth(m),   'yyyy-MM-dd');
        const mNet = raw
          .filter(s => s.period_start >= ms && s.period_end <= me)
          .reduce((s, r) => s + r.net_amount, 0);
        labels.push(format(m, 'M월', { locale: ko }));
        values.push(mNet);
      }
      setChartLabels(labels);
      setChartValues(values);

      setSettlements(raw);
      setBankName(counselorRes.data?.bank_name ?? null);
      setAccountNumber(counselorRes.data?.account_number ?? null);
    } catch (err) {
      console.error('수익 데이터 조회 실패:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // ── Filter ───────────────────────────────────────────────────────────────
  const filteredSettlements = useMemo(() => {
    const now = new Date();
    if (filter === 'this_month') {
      const s = format(startOfMonth(now), 'yyyy-MM-dd');
      const e = format(endOfMonth(now),   'yyyy-MM-dd');
      return settlements.filter(x => x.period_start >= s && x.period_start <= e);
    }
    if (filter === 'last_month') {
      const lm = subMonths(now, 1);
      const s  = format(startOfMonth(lm), 'yyyy-MM-dd');
      const e  = format(endOfMonth(lm),   'yyyy-MM-dd');
      return settlements.filter(x => x.period_start >= s && x.period_start <= e);
    }
    return settlements;
  }, [settlements, filter]);

  // ── Bank account save ────────────────────────────────────────────────────
  const openModal = () => {
    setBankInput(bankName ?? '');
    setAccountInput(accountNumber ?? '');
    setShowModal(true);
  };

  const saveBankAccount = async () => {
    if (!bankInput.trim() || !accountInput.trim()) {
      Alert.alert('입력 오류', '은행명과 계좌번호를 모두 입력해주세요');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('counselors')
      .update({ bank_name: bankInput.trim(), account_number: accountInput.trim() })
      .eq('id', user?.id);
    setSaving(false);
    if (error) { Alert.alert('저장 실패', '다시 시도해주세요'); return; }
    setBankName(bankInput.trim());
    setAccountNumber(accountInput.trim());
    setShowModal(false);
  };

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[s.fill, s.centered, { backgroundColor: C.cream }]}>
        <ActivityIndicator size="large" color={C.brown} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: C.cream }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.brown} />}
      >
        {/* ── 이번 달 요약 ── */}
        <MonthlySummary stats={monthlyStats} />

        {/* ── 월별 수익 추이 ── */}
        <SectionCard title="월별 수익 추이" icon="📈">
          <MonthlyBarChart labels={chartLabels} values={chartValues} />
        </SectionCard>

        {/* ── 수익 구조 ── */}
        <SectionCard title="수익 구조" icon="🥧">
          <RevenueBreakdown
            netAmount={monthlyStats.netAmount}
            feeAmount={monthlyStats.feeAmount}
          />
        </SectionCard>

        {/* ── 정산 내역 ── */}
        <SectionCard title="정산 내역" icon="🧾">
          <FilterTabs current={filter} onChange={setFilter} />
          {filteredSettlements.length === 0 ? (
            <EmptyState message="정산 내역이 없어요" />
          ) : (
            filteredSettlements.map(item => (
              <SettlementItem key={item.id} item={item} />
            ))
          )}
        </SectionCard>

        {/* ── 정산 계좌 ── */}
        <SectionCard title="정산 계좌" icon="🏦">
          <View style={s.bankRow}>
            <View style={{ flex: 1 }}>
              {bankName && accountNumber ? (
                <>
                  <Text style={s.bankName}>{bankName}</Text>
                  <Text style={s.bankAccount}>
                    {accountNumber.replace(/^(\d{3})\d+(\d{4})$/, '$1-****-$2')}
                  </Text>
                </>
              ) : (
                <Text style={s.bankEmpty}>계좌가 등록되지 않았어요</Text>
              )}
            </View>
            <TouchableOpacity style={s.bankEditBtn} onPress={openModal}>
              <Text style={s.bankEditText}>{bankName ? '수정' : '등록하기'}</Text>
            </TouchableOpacity>
          </View>
          {!bankName && (
            <Text style={s.bankNote}>계좌를 등록해야 정산금을 받을 수 있어요</Text>
          )}
        </SectionCard>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── 계좌 등록 모달 ── */}
      <BankModal
        visible={showModal}
        bankInput={bankInput}
        accountInput={accountInput}
        saving={saving}
        onBankChange={setBankInput}
        onAccountChange={setAccountInput}
        onCancel={() => setShowModal(false)}
        onSave={saveBankAccount}
      />
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: {
  title: string; icon: string; children: React.ReactNode;
}) {
  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Text style={{ fontSize: 17, marginRight: 8 }}>{icon}</Text>
        <Text style={s.cardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function MonthlySummary({ stats }: { stats: MonthlyStats }) {
  const label = format(new Date(), 'yyyy년 M월', { locale: ko });
  return (
    <View style={s.summaryCard}>
      <Text style={s.summaryMonth}>{label} 수익 요약</Text>
      <View style={s.summaryGrid}>
        <SummaryCell label="완료 상담" value={`${stats.sessions}건`}            accent />
        <SummaryCell label="총 결제금액"  value={formatKRW(stats.grossAmount)}  />
        <SummaryCell label="내 수익 (62%)" value={formatKRW(stats.netAmount)}   accent />
        <SummaryCell label="정산 대기"    value={formatKRW(stats.pendingAmount)} />
      </View>
    </View>
  );
}

function SummaryCell({ label, value, accent }: {
  label: string; value: string; accent?: boolean;
}) {
  return (
    <View style={s.summaryCell}>
      <Text style={s.summaryCellLabel}>{label}</Text>
      <Text style={[s.summaryCellValue, accent && { color: C.gold }]}>{value}</Text>
    </View>
  );
}

function MonthlyBarChart({ labels, values }: { labels: string[]; values: number[] }) {
  const max = Math.max(...values, 1);
  const barAreaH = CHART_H - 36;

  if (values.every(v => v === 0)) {
    return <EmptyState message="아직 정산된 수익이 없어요" />;
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: CHART_H, gap: 6 }}>
      {values.map((v, i) => {
        const barH      = Math.max(4, (v / max) * barAreaH);
        const isCurrent = i === values.length - 1;
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: CHART_H }}>
            {v > 0 && (
              <Text style={s.barValueLabel} numberOfLines={1}>
                {formatShort(v)}
              </Text>
            )}
            <View style={[s.bar, { height: barH, backgroundColor: isCurrent ? C.goldDark : C.gold }]} />
            <Text style={[s.barMonthLabel, isCurrent && { color: C.brown, fontWeight: '700' }]}>
              {labels[i]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function RevenueBreakdown({ netAmount, feeAmount }: { netAmount: number; feeAmount: number }) {
  const total = netAmount + feeAmount;
  if (total === 0) return <EmptyState message="이번 달 완료된 상담이 없어요" />;
  const netPct = Math.round((netAmount / total) * 100);

  return (
    <View>
      {/* 비율 바 */}
      <View style={s.breakdownBar}>
        <View style={[s.breakdownNet, { flex: netPct }]} />
        <View style={[s.breakdownFee, { flex: 100 - netPct }]} />
      </View>
      {/* 레전드 */}
      <View style={{ flexDirection: 'row', gap: 20, marginTop: 14 }}>
        <BreakdownLegend color={C.goldDark} label={`수령액 ${netPct}%`} amount={netAmount} />
        <BreakdownLegend color="#c5b9ae"    label={`수수료 ${100 - netPct}%`} amount={feeAmount} />
      </View>
    </View>
  );
}

function BreakdownLegend({ color, label, amount }: { color: string; label: string; amount: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 8 }} />
      <View>
        <Text style={{ fontSize: 11, color: C.brownPale }}>{label}</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.brown }}>{formatKRW(amount)}</Text>
      </View>
    </View>
  );
}

function FilterTabs({ current, onChange }: {
  current: FilterPeriod; onChange: (f: FilterPeriod) => void;
}) {
  const tabs: { key: FilterPeriod; label: string }[] = [
    { key: 'this_month', label: '이번 달' },
    { key: 'last_month', label: '지난 달' },
    { key: 'all',        label: '전체' },
  ];
  return (
    <View style={s.filterRow}>
      {tabs.map(t => (
        <TouchableOpacity
          key={t.key}
          style={[s.filterTab, current === t.key && s.filterTabActive]}
          onPress={() => onChange(t.key)}
        >
          <Text style={[s.filterTabText, current === t.key && s.filterTabTextActive]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function SettlementItem({ item }: { item: Settlement }) {
  const isPaid = item.status === 'paid';
  return (
    <View style={s.settlementItem}>
      <View style={{ flex: 1 }}>
        <Text style={s.settlementPeriod}>{item.period_start} ~ {item.period_end}</Text>
        <Text style={s.settlementSessions}>{item.total_sessions}건 상담 완료</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <Text style={s.settlementGross}>결제 {formatKRW(item.gross_amount)}</Text>
          <Text style={{ fontSize: 10, color: '#c5b9ae' }}>→</Text>
          <Text style={s.settlementNet}>수령 {formatKRW(item.net_amount)}</Text>
        </View>
      </View>
      <View style={[s.statusBadge, isPaid ? s.statusPaid : s.statusPending]}>
        <Text style={[s.statusText, { color: isPaid ? C.greenText : C.goldDark }]}>
          {isPaid ? '입금 완료' : '정산 대기'}
        </Text>
      </View>
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={s.emptyBox}>
      <Text style={{ fontSize: 28, marginBottom: 8 }}>📂</Text>
      <Text style={{ fontSize: 13, color: C.brownPale }}>{message}</Text>
    </View>
  );
}

function BankModal({ visible, bankInput, accountInput, saving, onBankChange, onAccountChange, onCancel, onSave }: {
  visible: boolean;
  bankInput: string;
  accountInput: string;
  saving: boolean;
  onBankChange: (v: string) => void;
  onAccountChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={s.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>정산 계좌 등록</Text>

          <Text style={s.modalLabel}>은행명</Text>
          <TextInput
            style={s.modalInput}
            placeholder="예: 신한은행"
            placeholderTextColor={C.brownPale}
            value={bankInput}
            onChangeText={onBankChange}
          />

          <Text style={[s.modalLabel, { marginTop: 16 }]}>계좌번호</Text>
          <TextInput
            style={s.modalInput}
            placeholder="예: 110-123-456789"
            placeholderTextColor={C.brownPale}
            keyboardType="numbers-and-punctuation"
            value={accountInput}
            onChangeText={onAccountChange}
          />

          <View style={s.modalBtns}>
            <TouchableOpacity style={s.modalCancelBtn} onPress={onCancel}>
              <Text style={s.modalCancelText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.modalSaveBtn, saving && { opacity: 0.6 }]}
              onPress={onSave}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color={C.white} />
                : <Text style={s.modalSaveText}>저장하기</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  fill:    { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },

  // Summary
  summaryCard: {
    margin: 16,
    padding: 22,
    backgroundColor: C.brown,
    borderRadius: 22,
  },
  summaryMonth: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
    marginBottom: 18,
    letterSpacing: 0.3,
  },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCell: {
    width: (W - 32 - 44 - 10) / 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
  },
  summaryCellLabel: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 7 },
  summaryCellValue: { fontSize: 16, fontWeight: '800', color: '#ffffff' },

  // Section card
  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 18,
    shadowColor: C.brown,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  cardTitle:  { fontSize: 15, fontWeight: '700', color: C.brown },

  // Bar chart
  bar:           { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  barValueLabel: { fontSize: 9, color: C.brownPale, marginBottom: 4 },
  barMonthLabel: { fontSize: 10, color: C.brownPale, marginTop: 7 },

  // Revenue breakdown
  breakdownBar: {
    flexDirection: 'row',
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  breakdownNet: { backgroundColor: C.goldDark },
  breakdownFee: { backgroundColor: '#e5ddd6' },

  // Filter tabs
  filterRow:         { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterTab:         { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f5f0e8' },
  filterTabActive:   { backgroundColor: C.brown },
  filterTabText:     { fontSize: 12, color: C.brownPale, fontWeight: '600' },
  filterTabTextActive: { color: C.white },

  // Settlement item
  settlementItem:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.divider },
  settlementPeriod:  { fontSize: 11, color: C.brownPale, marginBottom: 2 },
  settlementSessions:{ fontSize: 14, fontWeight: '700', color: C.brown, marginBottom: 4 },
  settlementGross:   { fontSize: 12, color: C.brownPale },
  settlementNet:     { fontSize: 13, fontWeight: '700', color: C.goldDark },
  statusBadge:       { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginLeft: 10 },
  statusPaid:        { backgroundColor: C.greenBg },
  statusPending:     { backgroundColor: C.goldBg },
  statusText:        { fontSize: 11, fontWeight: '700' },

  // Bank
  bankRow:      { flexDirection: 'row', alignItems: 'center' },
  bankName:     { fontSize: 15, fontWeight: '700', color: C.brown, marginBottom: 3 },
  bankAccount:  { fontSize: 13, color: C.brownPale },
  bankEmpty:    { fontSize: 13, color: '#bdbdbd' },
  bankEditBtn:  { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#f5f0e8', borderRadius: 12 },
  bankEditText: { fontSize: 13, fontWeight: '700', color: C.brown },
  bankNote:     { fontSize: 11, color: '#e57373', marginTop: 10 },

  // Empty state
  emptyBox: { alignItems: 'center', paddingVertical: 28 },

  // Modal
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard:       { backgroundColor: C.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: Platform.OS === 'ios' ? 42 : 24 },
  modalTitle:      { fontSize: 18, fontWeight: '800', color: C.brown, marginBottom: 22 },
  modalLabel:      { fontSize: 12, fontWeight: '700', color: C.brownPale, marginBottom: 8 },
  modalInput:      { backgroundColor: '#f5f0e8', borderRadius: 14, padding: 14, fontSize: 15, color: C.brown },
  modalBtns:       { flexDirection: 'row', gap: 12, marginTop: 24 },
  modalCancelBtn:  { flex: 1, paddingVertical: 15, backgroundColor: '#f5f0e8', borderRadius: 14, alignItems: 'center' },
  modalCancelText: { fontSize: 15, fontWeight: '700', color: C.brownPale },
  modalSaveBtn:    { flex: 2, paddingVertical: 15, backgroundColor: C.brown, borderRadius: 14, alignItems: 'center' },
  modalSaveText:   { fontSize: 15, fontWeight: '700', color: C.white },
});
