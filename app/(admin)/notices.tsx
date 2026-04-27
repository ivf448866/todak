import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, Modal, Switch, Platform,
} from 'react-native';
import { adminGetNotices, adminCreateNotice, adminUpdateNotice, adminDeleteNotice } from '@/lib/supabase';
import { Notice, NoticeTarget } from '@/types';

const C = {
  bg: '#faf8f5', brown: '#3d2c1e', gold: '#f0c98a',
  pale: '#8c7b6b', white: '#ffffff', admin: '#1e293b',
  red: '#dc2626', border: '#e8e0d5',
} as const;

const TARGET_OPTIONS: { value: NoticeTarget; label: string }[] = [
  { value: 'all',       label: '전체' },
  { value: 'user',      label: '이용자' },
  { value: 'counselor', label: '상담사' },
];

const EMPTY_FORM = { title: '', content: '', is_pinned: false, target_role: 'all' as NoticeTarget };

export default function AdminNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await adminGetNotices();
      setNotices(data as Notice[]);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function openEdit(notice: Notice) {
    setEditing(notice);
    setForm({
      title:       notice.title,
      content:     notice.content,
      is_pinned:   notice.is_pinned,
      target_role: notice.target_role,
    });
    setModalVisible(true);
  }

  async function handleSave() {
    if (!form.title.trim())   { Alert.alert('제목을 입력해주세요'); return; }
    if (!form.content.trim()) { Alert.alert('내용을 입력해주세요'); return; }
    try {
      setSaving(true);
      const payload = {
        title:       form.title.trim(),
        content:     form.content.trim(),
        is_pinned:   form.is_pinned,
        target_role: form.target_role,
      };
      if (editing) {
        await adminUpdateNotice(editing.id, payload);
      } else {
        await adminCreateNotice(payload);
      }
      setModalVisible(false);
      await load();
    } catch (e: any) {
      Alert.alert('저장 실패', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(notice: Notice) {
    const doDelete = async () => {
      try {
        await adminDeleteNotice(notice.id);
        await load();
      } catch (e: any) {
        Alert.alert('삭제 실패', e.message);
      }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`"${notice.title}"을 삭제하시겠어요?`)) doDelete();
    } else {
      Alert.alert('삭제', `"${notice.title}"을 삭제하시겠어요?`, [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: doDelete },
      ]);
    }
  }

  async function togglePin(notice: Notice) {
    try {
      await adminUpdateNotice(notice.id, { is_pinned: !notice.is_pinned });
      setNotices((prev) =>
        prev.map((n) => n.id === notice.id ? { ...n, is_pinned: !n.is_pinned } : n)
      );
    } catch (e: any) {
      Alert.alert('오류', e.message);
    }
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.admin} size="large" /></View>;
  }

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.topRow}>
          <Text style={s.count}>{notices.length}개 공지</Text>
          <TouchableOpacity style={s.addBtn} onPress={openCreate} activeOpacity={0.8}>
            <Text style={s.addBtnText}>+ 공지 작성</Text>
          </TouchableOpacity>
        </View>

        {notices.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📢</Text>
            <Text style={s.emptyText}>등록된 공지사항이 없습니다.</Text>
          </View>
        ) : (
          notices.map((notice) => (
            <NoticeCard
              key={notice.id}
              notice={notice}
              onEdit={openEdit}
              onDelete={handleDelete}
              onTogglePin={togglePin}
            />
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={m.container}>
          <View style={m.header}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={m.cancel}>취소</Text>
            </TouchableOpacity>
            <Text style={m.title}>{editing ? '공지 수정' : '공지 작성'}</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator color={C.admin} size="small" />
                : <Text style={m.save}>저장</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={m.body}>
            {/* 대상 선택 */}
            <Text style={m.label}>대상</Text>
            <View style={m.targetRow}>
              {TARGET_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[m.targetBtn, form.target_role === opt.value && m.targetBtnActive]}
                  onPress={() => setForm({ ...form, target_role: opt.value })}
                  activeOpacity={0.7}
                >
                  <Text style={[m.targetText, form.target_role === opt.value && m.targetTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={m.label}>제목 *</Text>
            <TextInput
              style={m.input}
              value={form.title}
              onChangeText={(v) => setForm({ ...form, title: v })}
              placeholder="공지 제목을 입력하세요"
              placeholderTextColor={C.pale}
            />

            <Text style={m.label}>내용 *</Text>
            <TextInput
              style={[m.input, m.textarea]}
              value={form.content}
              onChangeText={(v) => setForm({ ...form, content: v })}
              placeholder="공지 내용을 입력하세요"
              placeholderTextColor={C.pale}
              multiline
              numberOfLines={8}
            />

            <View style={m.switchRow}>
              <View>
                <Text style={m.switchLabel}>상단 고정</Text>
                <Text style={m.switchSub}>목록 최상단에 표시</Text>
              </View>
              <Switch
                value={form.is_pinned}
                onValueChange={(v) => setForm({ ...form, is_pinned: v })}
                trackColor={{ true: C.admin }}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function NoticeCard({ notice, onEdit, onDelete, onTogglePin }: {
  notice: Notice;
  onEdit: (n: Notice) => void;
  onDelete: (n: Notice) => void;
  onTogglePin: (n: Notice) => void;
}) {
  const targetLabel = notice.target_role === 'all' ? '전체' : notice.target_role === 'user' ? '이용자' : '상담사';
  const date = new Date(notice.created_at).toLocaleDateString('ko-KR');

  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={s.badges}>
          {notice.is_pinned && (
            <View style={s.pinBadge}><Text style={s.pinText}>📌 고정</Text></View>
          )}
          <View style={s.targetBadge}><Text style={s.targetText}>{targetLabel}</Text></View>
        </View>
        <Text style={s.date}>{date}</Text>
      </View>
      <Text style={s.cardTitle}>{notice.title}</Text>
      <Text style={s.cardContent} numberOfLines={3}>{notice.content}</Text>
      <View style={s.cardActions}>
        <TouchableOpacity style={s.pinBtn} onPress={() => onTogglePin(notice)} activeOpacity={0.7}>
          <Text style={s.pinBtnText}>{notice.is_pinned ? '고정 해제' : '고정'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.editBtn} onPress={() => onEdit(notice)} activeOpacity={0.7}>
          <Text style={s.editBtnText}>수정</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.deleteBtn} onPress={() => onDelete(notice)} activeOpacity={0.7}>
          <Text style={s.deleteBtnText}>삭제</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: C.bg },
  content:      { padding: 16, paddingBottom: 40 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  count:        { fontSize: 14, color: C.pale, fontWeight: '600' },
  addBtn:       { backgroundColor: C.admin, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  addBtnText:   { color: C.white, fontWeight: '700', fontSize: 13 },
  empty:        { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyIcon:    { fontSize: 40 },
  emptyText:    { color: C.pale, fontSize: 15 },
  card:         { backgroundColor: C.white, borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: C.brown, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, gap: 6 },
  cardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badges:       { flexDirection: 'row', gap: 6 },
  pinBadge:     { backgroundColor: '#fef9c3', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  pinText:      { fontSize: 11, fontWeight: '700', color: '#92400e' },
  targetBadge:  { backgroundColor: '#f0f9ff', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  targetText:   { fontSize: 11, fontWeight: '700', color: '#0369a1' },
  date:         { fontSize: 12, color: C.pale },
  cardTitle:    { fontSize: 15, fontWeight: '800', color: C.brown },
  cardContent:  { fontSize: 13, color: C.pale, lineHeight: 19 },
  cardActions:  { flexDirection: 'row', gap: 8, marginTop: 4 },
  pinBtn:       { backgroundColor: '#f0ebe3', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  pinBtnText:   { fontSize: 12, fontWeight: '700', color: C.pale },
  editBtn:      { backgroundColor: C.gold, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  editBtnText:  { fontSize: 12, fontWeight: '700', color: C.brown },
  deleteBtn:    { backgroundColor: '#fef2f2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  deleteBtnText:{ fontSize: 12, fontWeight: '700', color: C.red },
});

const m = StyleSheet.create({
  container:       { flex: 1, backgroundColor: C.bg },
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  cancel:          { fontSize: 15, color: C.pale, fontWeight: '600' },
  title:           { fontSize: 16, fontWeight: '800', color: C.brown },
  save:            { fontSize: 15, color: C.admin, fontWeight: '800' },
  body:            { padding: 20, paddingBottom: 60, gap: 6 },
  label:           { fontSize: 13, fontWeight: '700', color: C.pale, marginBottom: 6, marginTop: 8 },
  input:           { backgroundColor: C.white, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.brown, marginBottom: 4 },
  textarea:        { minHeight: 160, textAlignVertical: 'top' },
  targetRow:       { flexDirection: 'row', gap: 8, marginBottom: 8 },
  targetBtn:       { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: '#f0ebe3', borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  targetBtnActive: { backgroundColor: C.admin, borderColor: C.admin },
  targetText:      { fontSize: 13, fontWeight: '700', color: C.pale },
  targetTextActive:{ color: C.white },
  switchRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border, marginTop: 12 },
  switchLabel:     { fontSize: 15, fontWeight: '700', color: C.brown },
  switchSub:       { fontSize: 12, color: C.pale, marginTop: 2 },
});
