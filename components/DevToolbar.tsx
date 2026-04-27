import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { UserRole } from '@/types';

const ROUTE: Record<UserRole, string> = {
  counselor: '/(counselor)/dashboard',
  user:      '/(user)/home',
};

const TABS: { role: UserRole; icon: string; label: string }[] = [
  { role: 'counselor', icon: '🎧', label: '상담사' },
  { role: 'user',      icon: '🙋', label: '이용자' },
];

export function DevToolbar() {
  if (!__DEV__) return null;

  const router   = useRouter();
  const { user } = useAuthStore();
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function switchTo(role: UserRole) {
    if (role === user!.role || busy) return;
    setBusy(true);
    // 스토어에서 role만 임시 교체 (DB 미반영 — 개발 전용)
    useAuthStore.setState(s => ({
      user: s.user ? { ...s.user, role } : null,
    }));
    router.replace(ROUTE[role] as any);
    setBusy(false);
  }

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <View style={s.pill}>
        <Text style={s.devLabel}>DEV</Text>
        <View style={s.divider} />
        {TABS.map(tab => {
          const active = user.role === tab.role;
          return (
            <TouchableOpacity
              key={tab.role}
              style={[s.tab, active && s.tabActive]}
              onPress={() => switchTo(tab.role)}
              activeOpacity={0.7}
              disabled={busy}
            >
              <Text style={s.tabIcon}>{tab.icon}</Text>
              <Text style={[s.tabText, active && s.tabTextActive]}>
                {tab.label}
              </Text>
              {active && <View style={s.activeDot} />}
            </TouchableOpacity>
          );
        })}
        {busy && <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 6 }} />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    left: 0, right: 0,
    alignItems: 'center',
    zIndex: 9999,
    pointerEvents: 'box-none' as any,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(25, 15, 8, 0.82)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 12,
  },
  devLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#f0c98a',
    letterSpacing: 1,
    paddingHorizontal: 2,
  },
  divider: {
    width: 1, height: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 2,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  tabActive:     { backgroundColor: 'rgba(240,201,138,0.2)' },
  tabIcon:       { fontSize: 13 },
  tabText:       { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  tabTextActive: { color: '#f0c98a', fontWeight: '800' },
  activeDot: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: '#f0c98a',
    marginLeft: 1,
  },
});
