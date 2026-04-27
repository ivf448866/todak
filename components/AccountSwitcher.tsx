import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, FlatList,
  StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { User } from '@/types';

const C = {
  cream: '#faf8f5', brown: '#3d2c1e', brownLight: '#5a4633',
  brownPale: '#8c7b6b', gold: '#f0c98a', goldLight: '#f5ddb5',
  white: '#ffffff',
} as const;

export function AccountSwitcher() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [visible, setVisible] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const open = async () => {
    setVisible(true);
    setLoading(true);
    try {
      const { data } = await supabase
        .from('users')
        .select('id, name, role, avatar_emoji, created_at')
        .order('role', { ascending: false })   // counselor 먼저
        .order('created_at', { ascending: true });
      setUsers((data ?? []) as User[]);
    } finally {
      setLoading(false);
    }
  };

  const switchTo = async (target: User) => {
    if (target.id === user?.id) { setVisible(false); return; }
    setSwitching(target.id);
    try {
      await logout();
      router.replace('/login');
    } finally {
      setSwitching(null);
      setVisible(false);
    }
  };

  return (
    <>
      {/* 트리거 버튼 */}
      <TouchableOpacity style={s.trigger} onPress={open} activeOpacity={0.75}>
        <Text style={s.triggerEmoji}>{user?.avatar_emoji ?? '👤'}</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setVisible(false)}
      >
        {/* 배경 딤 */}
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setVisible(false)} />

        {/* 패널 */}
        <View style={s.panel}>
          <View style={s.panelInner}>
            <View style={s.handle} />

            <View style={s.panelHeader}>
              <Text style={s.panelTitle}>계정 전환</Text>
              <TouchableOpacity onPress={() => setVisible(false)} style={s.closeBtn}>
                <Text style={s.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator color={C.brown} style={{ marginVertical: 28 }} />
            ) : (
              <FlatList
                data={users}
                keyExtractor={(u) => u.id}
                style={s.list}
                ItemSeparatorComponent={() => <View style={s.sep} />}
                renderItem={({ item }) => {
                  const isCurrent = item.id === user?.id;
                  const isSwitching = switching === item.id;
                  return (
                    <TouchableOpacity
                      style={[s.row, isCurrent && s.rowCurrent]}
                      onPress={() => switchTo(item)}
                      activeOpacity={isCurrent ? 1 : 0.7}
                      disabled={isCurrent || !!switching}
                    >
                      <View style={[s.avatarWrap, isCurrent && s.avatarWrapCurrent]}>
                        <Text style={s.avatarEmoji}>{item.avatar_emoji ?? '👤'}</Text>
                      </View>

                      <View style={s.info}>
                        <Text style={[s.userName, isCurrent && s.userNameCurrent]}>
                          {item.name}
                        </Text>
                        <View style={[s.badge, item.role === 'counselor' ? s.badgeCounselor : s.badgeUser]}>
                          <Text style={[s.badgeText, item.role === 'counselor' ? s.badgeTextCounselor : s.badgeTextUser]}>
                            {item.role === 'counselor' ? '🎧 상담사' : '🙋 이용자'}
                          </Text>
                        </View>
                      </View>

                      {isCurrent ? (
                        <View style={s.currentTag}>
                          <Text style={s.currentTagText}>현재</Text>
                        </View>
                      ) : isSwitching ? (
                        <ActivityIndicator size="small" color={C.brown} />
                      ) : (
                        <View style={s.switchBtn}>
                          <Text style={s.switchText}>전환</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <Text style={s.hint}>전환 시 로그아웃 후 로그인 화면으로 이동합니다</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const PANEL_WIDTH = 300;

const s = StyleSheet.create({
  trigger: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#f0ebe3',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#e0d5c8',
  },
  triggerEmoji: { fontSize: 17 },

  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(30,20,10,0.45)',
  },

  panel: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 72,
    right: 16,
    width: PANEL_WIDTH,
  },
  panelInner: {
    backgroundColor: C.white,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: C.brown,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#e0d5c8',
    alignSelf: 'center',
    marginTop: 10, marginBottom: 4,
  },
  panelHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#f0ebe3',
  },
  panelTitle: { fontSize: 15, fontWeight: '800', color: C.brown },
  closeBtn: { padding: 4 },
  closeText: { fontSize: 14, color: C.brownPale },

  list: { maxHeight: 320 },
  sep: { height: 1, backgroundColor: '#f5f0ea', marginHorizontal: 16 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  rowCurrent: { backgroundColor: '#fdf9f4' },

  avatarWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f0ebe3',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  avatarWrapCurrent: { borderColor: C.gold, backgroundColor: '#fffbf3' },
  avatarEmoji: { fontSize: 20 },

  info: { flex: 1, gap: 4 },
  userName: { fontSize: 14, fontWeight: '700', color: C.brownLight },
  userNameCurrent: { color: C.brown },

  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 6,
  },
  badgeUser: { backgroundColor: '#eef2ff' },
  badgeCounselor: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextUser: { color: '#4338ca' },
  badgeTextCounselor: { color: '#92400e' },

  currentTag: {
    backgroundColor: C.goldLight,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  currentTagText: { fontSize: 12, fontWeight: '700', color: C.brown },

  switchBtn: {
    backgroundColor: C.brown,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
  },
  switchText: { fontSize: 12, fontWeight: '700', color: C.white },

  hint: {
    fontSize: 11, color: C.brownPale, textAlign: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#f0ebe3',
  },
});
