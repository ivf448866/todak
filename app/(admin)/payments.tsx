import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { supabase } from '@/lib/supabase';

const C = {
  bg: '#faf8f5', brown: '#3d2c1e', gold: '#f0c98a',
  pale: '#8c7b6b', white: '#ffffff', admin: '#1e293b',
  green: '#16a34a', greenBg: '#f0fdf4',
  red: '#dc2626', redBg: '#fef2f2',
  border: '#e8e0d5',
} as const;

interface PendingBooking {
  id: string;
  scheduled_at: string;
  amount: number;
  status: string;
  user: { name: string };
  counselor: { name: string };
}

export default function PaymentsScreen() {
  const [bookings, setBookings]   = useState<PendingBooking[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, scheduled_at, amount, status,
          users(name),
          counselors(users(name))
        `)
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true });

      if (error) throw error;

      setBookings(
        (data ?? []).map((b: any) => ({
          id:           b.id,
          scheduled_at: b.scheduled_at,
          amount:       b.amount,
          status:       b.status,
          user:         { name: b.users?.name ?? '이용자' },
          counselor:    { name: b.counselors?.users?.name ?? '상담사' },
        }))
      );
    } catch (e: any) {
      console.error('예약 조회 실패:', e);
      Alert.alert('조회 오류', e?.message ?? '예약 목록을 불러오지 못했어요.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, []);

  const handleConfirm = (booking: PendingBooking) => {
    Alert.alert(
      '입금 확인',
      `${booking.user.name}님의 ${booking.amount.toLocaleString()}원 입금을 확인하고 예약을 승인할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '확인 승인',
          onPress: async () => {
            setConfirming(booking.id);
            try {
              const { error } = await supabase.functions.invoke('confirm-payment', {
                body: { bookingId: booking.id },
              });
              if (error) throw error;
              Alert.alert('완료', '예약이 확정됐어요. 이용자와 상담사에게 알림을 보냈어요.');
              load();
            } catch (err: any) {
              Alert.alert('오류', err.message ?? '처리에 실패했어요.');
            } finally {
              setConfirming(null);
            }
          },
        },
      ]
    );
  };

  const handleReject = (booking: PendingBooking) => {
    Alert.alert(
      '예약 거절',
      `${booking.user.name}님의 예약을 거절할까요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '거절',
          style: 'destructive',
          onPress: async () => {
            setConfirming(booking.id);
            try {
              const { error } = await supabase
                .from('bookings')
                .update({ status: 'cancelled' })
                .eq('id', booking.id);
              if (error) throw error;
              load();
            } catch (err: any) {
              Alert.alert('오류', err.message ?? '처리에 실패했어요.');
            } finally {
              setConfirming(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.admin} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }}
        />
      }
    >
      {/* 계좌 정보 안내 */}
      <View style={s.bankInfoBox}>
        <Text style={s.bankInfoTitle}>입금 계좌</Text>
        <Text style={s.bankInfoText}>기업은행 010-8972-5642  최성찬</Text>
      </View>

      {bookings.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>✅</Text>
          <Text style={s.emptyTitle}>처리할 입금 건이 없어요</Text>
          <Text style={s.emptySub}>새 예약이 들어오면 여기 표시돼요</Text>
        </View>
      ) : (
        <>
          <Text style={s.sectionTitle}>입금 대기 {bookings.length}건</Text>
          {bookings.map((booking) => {
            const d = new Date(booking.scheduled_at);
            const dateStr = `${d.getMonth() + 1}/${d.getDate()}(${['일','월','화','수','목','금','토'][d.getDay()]}) ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            const isBusy = confirming === booking.id;

            return (
              <View key={booking.id} style={s.card}>
                <View style={s.cardHeader}>
                  <View style={s.statusBadge}>
                    <Text style={s.statusText}>입금 대기</Text>
                  </View>
                  <Text style={s.dateText}>{dateStr}</Text>
                </View>

                <View style={s.cardBody}>
                  <View style={s.row}>
                    <Text style={s.label}>이용자</Text>
                    <Text style={s.value}>{booking.user.name}</Text>
                  </View>
                  <View style={s.row}>
                    <Text style={s.label}>상담사</Text>
                    <Text style={s.value}>{booking.counselor.name}</Text>
                  </View>
                  <View style={[s.row, { borderBottomWidth: 0 }]}>
                    <Text style={s.label}>금액</Text>
                    <Text style={s.amountValue}>{booking.amount.toLocaleString()}원</Text>
                  </View>
                </View>

                <View style={s.cardActions}>
                  <TouchableOpacity
                    style={[s.rejectBtn, isBusy && s.btnDisabled]}
                    onPress={() => handleReject(booking)}
                    disabled={isBusy}
                  >
                    <Text style={s.rejectBtnText}>거절</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.confirmBtn, isBusy && s.btnDisabled]}
                    onPress={() => handleConfirm(booking)}
                    disabled={isBusy}
                  >
                    {isBusy
                      ? <ActivityIndicator size="small" color={C.white} />
                      : <Text style={s.confirmBtnText}>입금 확인 ✓</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content:   { padding: 20, paddingBottom: 40 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  bankInfoBox: {
    backgroundColor: '#f0f9ff', borderRadius: 12,
    padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: '#bae6fd',
  },
  bankInfoTitle: { fontSize: 11, fontWeight: '700', color: '#0369a1', marginBottom: 4, letterSpacing: 0.5 },
  bankInfoText:  { fontSize: 14, fontWeight: '700', color: C.brown },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.brown, marginBottom: 14 },

  card: {
    backgroundColor: C.white, borderRadius: 16, marginBottom: 14,
    shadowColor: C.brown, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fef9c3', borderBottomWidth: 1, borderBottomColor: '#fef08a',
  },
  statusBadge: {
    backgroundColor: '#fef08a', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  statusText: { fontSize: 11, fontWeight: '700', color: '#854d0e' },
  dateText:   { fontSize: 13, fontWeight: '600', color: C.brown },

  cardBody: { padding: 16 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f5f0e8',
  },
  label:       { fontSize: 13, color: C.pale, fontWeight: '500' },
  value:       { fontSize: 13, color: C.brown, fontWeight: '600' },
  amountValue: { fontSize: 17, color: C.brown, fontWeight: '900' },

  cardActions: {
    flexDirection: 'row', gap: 10,
    padding: 14, borderTopWidth: 1, borderTopColor: '#f5f0e8',
  },
  rejectBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
    backgroundColor: C.redBg, borderWidth: 1, borderColor: '#fca5a5',
  },
  rejectBtnText: { fontSize: 14, fontWeight: '700', color: C.red },
  confirmBtn: {
    flex: 2, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
    backgroundColor: C.admin,
  },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: C.white },
  btnDisabled: { opacity: 0.5 },

  empty: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.brown, marginBottom: 6 },
  emptySub:   { fontSize: 13, color: C.pale },
});
