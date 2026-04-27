import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, Modal, Switch, Platform,
} from 'react-native';
import { getCourses, adminCreateCourse, adminUpdateCourse, adminDeleteCourse } from '@/lib/supabase';
import { Course } from '@/types';

const C = {
  bg: '#faf8f5', brown: '#3d2c1e', gold: '#f0c98a', goldLight: '#f5ddb5',
  pale: '#8c7b6b', white: '#ffffff', admin: '#1e293b', red: '#dc2626',
  green: '#16a34a', border: '#e8e0d5',
} as const;

const EMPTY_FORM = { title: '', description: '', video_url: '', duration_minutes: '30', is_required: true, order_index: '0' };

export default function AdminCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setLoading(true);
      const data = await getCourses();
      setCourses((data ?? []) as Course[]);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, order_index: String((courses.length + 1) * 10) });
    setModalVisible(true);
  }

  function openEdit(course: Course) {
    setEditing(course);
    setForm({
      title:            course.title,
      description:      course.description ?? '',
      video_url:        course.video_url ?? '',
      duration_minutes: String(course.duration_minutes),
      is_required:      course.is_required,
      order_index:      String(course.order_index),
    });
    setModalVisible(true);
  }

  async function handleSave() {
    if (!form.title.trim()) { Alert.alert('제목을 입력해주세요'); return; }
    const dur = parseInt(form.duration_minutes, 10);
    if (!dur || dur < 1) { Alert.alert('강의 시간을 올바르게 입력해주세요'); return; }

    try {
      setSaving(true);
      const payload = {
        title:            form.title.trim(),
        description:      form.description.trim() || undefined,
        video_url:        form.video_url.trim() || undefined,
        duration_minutes: dur,
        is_required:      form.is_required,
        order_index:      parseInt(form.order_index, 10) || 0,
      };

      if (editing) {
        await adminUpdateCourse(editing.id, payload);
      } else {
        await adminCreateCourse(payload);
      }
      setModalVisible(false);
      await load();
    } catch (e: any) {
      Alert.alert('저장 실패', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(course: Course) {
    const doDelete = async () => {
      try {
        await adminDeleteCourse(course.id);
        await load();
      } catch (e: any) {
        Alert.alert('삭제 실패', e.message);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`"${course.title}" 을 삭제하시겠어요?`)) doDelete();
    } else {
      Alert.alert('삭제', `"${course.title}" 을 삭제하시겠어요?`, [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: doDelete },
      ]);
    }
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.admin} size="large" /></View>;
  }

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.topRow}>
          <Text style={s.count}>{courses.length}개 과정</Text>
          <TouchableOpacity style={s.addBtn} onPress={openCreate} activeOpacity={0.8}>
            <Text style={s.addBtnText}>+ 새 과정 추가</Text>
          </TouchableOpacity>
        </View>

        {courses.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📚</Text>
            <Text style={s.emptyText}>등록된 교육 과정이 없습니다.</Text>
          </View>
        ) : (
          courses.map((course) => (
            <CourseCard key={course.id} course={course} onEdit={openEdit} onDelete={handleDelete} />
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={m.container}>
          <View style={m.header}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={m.cancel}>취소</Text>
            </TouchableOpacity>
            <Text style={m.title}>{editing ? '과정 수정' : '새 과정 추가'}</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator color={C.admin} size="small" />
                : <Text style={m.save}>저장</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={m.body}>
            <Field label="제목 *">
              <TextInput
                style={m.input}
                value={form.title}
                onChangeText={(v) => setForm({ ...form, title: v })}
                placeholder="예: 경청 기초"
                placeholderTextColor={C.pale}
              />
            </Field>

            <Field label="설명">
              <TextInput
                style={[m.input, m.textarea]}
                value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })}
                placeholder="강의 설명을 입력하세요"
                placeholderTextColor={C.pale}
                multiline
                numberOfLines={4}
              />
            </Field>

            <Field label="영상 URL">
              <TextInput
                style={m.input}
                value={form.video_url}
                onChangeText={(v) => setForm({ ...form, video_url: v })}
                placeholder="https://youtube.com/..."
                placeholderTextColor={C.pale}
                autoCapitalize="none"
                keyboardType="url"
              />
            </Field>

            <View style={m.row}>
              <View style={{ flex: 1 }}>
                <Field label="강의 시간 (분) *">
                  <TextInput
                    style={m.input}
                    value={form.duration_minutes}
                    onChangeText={(v) => setForm({ ...form, duration_minutes: v })}
                    keyboardType="number-pad"
                    placeholder="30"
                    placeholderTextColor={C.pale}
                  />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="순서 번호">
                  <TextInput
                    style={m.input}
                    value={form.order_index}
                    onChangeText={(v) => setForm({ ...form, order_index: v })}
                    keyboardType="number-pad"
                    placeholder="10"
                    placeholderTextColor={C.pale}
                  />
                </Field>
              </View>
            </View>

            <View style={m.switchRow}>
              <Text style={m.switchLabel}>필수 과정</Text>
              <Switch
                value={form.is_required}
                onValueChange={(v) => setForm({ ...form, is_required: v })}
                trackColor={{ true: C.admin }}
              />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function CourseCard({ course, onEdit, onDelete }: {
  course: Course;
  onEdit: (c: Course) => void;
  onDelete: (c: Course) => void;
}) {
  return (
    <View style={s.card}>
      <View style={s.cardLeft}>
        <View style={s.orderBadge}>
          <Text style={s.orderText}>#{course.order_index}</Text>
        </View>
      </View>
      <View style={s.cardBody}>
        <View style={s.cardTitleRow}>
          <Text style={s.cardTitle} numberOfLines={1}>{course.title}</Text>
          {course.is_required && (
            <View style={s.requiredBadge}><Text style={s.requiredText}>필수</Text></View>
          )}
        </View>
        {!!course.description && (
          <Text style={s.cardDesc} numberOfLines={2}>{course.description}</Text>
        )}
        <View style={s.cardMeta}>
          <Text style={s.metaText}>⏱ {course.duration_minutes}분</Text>
          {!!course.video_url && <Text style={s.metaText}>🎬 영상 있음</Text>}
        </View>
      </View>
      <View style={s.cardActions}>
        <TouchableOpacity style={s.editBtn} onPress={() => onEdit(course)} activeOpacity={0.7}>
          <Text style={s.editBtnText}>수정</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.deleteBtn} onPress={() => onDelete(course)} activeOpacity={0.7}>
          <Text style={s.deleteBtnText}>삭제</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={m.field}>
      <Text style={m.fieldLabel}>{label}</Text>
      {children}
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
  card:         { backgroundColor: C.white, borderRadius: 14, padding: 14, marginBottom: 12, flexDirection: 'row', gap: 10, shadowColor: C.brown, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  cardLeft:     { justifyContent: 'flex-start', paddingTop: 2 },
  orderBadge:   { backgroundColor: '#f0ebe3', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  orderText:    { fontSize: 11, fontWeight: '700', color: C.pale },
  cardBody:     { flex: 1, gap: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle:    { fontSize: 15, fontWeight: '700', color: C.brown, flex: 1 },
  requiredBadge:{ backgroundColor: '#fef9c3', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  requiredText: { fontSize: 10, fontWeight: '700', color: '#92400e' },
  cardDesc:     { fontSize: 13, color: C.pale, lineHeight: 18 },
  cardMeta:     { flexDirection: 'row', gap: 10, marginTop: 2 },
  metaText:     { fontSize: 12, color: C.pale },
  cardActions:  { justifyContent: 'center', gap: 6 },
  editBtn:      { backgroundColor: C.gold, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  editBtnText:  { fontSize: 12, fontWeight: '700', color: C.brown },
  deleteBtn:    { backgroundColor: '#fef2f2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  deleteBtnText:{ fontSize: 12, fontWeight: '700', color: C.red },
});

const m = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.border },
  cancel:    { fontSize: 15, color: C.pale, fontWeight: '600' },
  title:     { fontSize: 16, fontWeight: '800', color: C.brown },
  save:      { fontSize: 15, color: C.admin, fontWeight: '800' },
  body:      { padding: 20, paddingBottom: 60, gap: 4 },
  field:     { marginBottom: 16 },
  fieldLabel:{ fontSize: 13, fontWeight: '700', color: C.pale, marginBottom: 6 },
  input:     { backgroundColor: C.white, borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.brown },
  textarea:  { minHeight: 90, textAlignVertical: 'top' },
  row:       { flexDirection: 'row', gap: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: C.border, marginTop: 8 },
  switchLabel:{ fontSize: 15, fontWeight: '600', color: C.brown },
});
