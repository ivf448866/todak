import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { Database } from '../types/database';

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';

export const isSupabaseConfigured =
  supabaseUrl !== 'https://placeholder.supabase.co' &&
  !supabaseUrl.includes('placeholder') &&
  supabaseAnonKey !== 'placeholder';

if (!isSupabaseConfigured) {
  console.warn('[토닥] Supabase 미설정: .env.local에 실제 URL과 KEY를 입력하세요.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    flowType: 'pkce',
    detectSessionInUrl: true,  // 웹 OAuth 콜백 URL의 code를 자동으로 세션으로 교환
  },
  // 웹에서는 WebSocket 연결 시도 자체를 막음
  realtime: Platform.OS !== 'web'
    ? { params: { eventsPerSecond: 10 } }
    : { timeout: 0, params: { eventsPerSecond: 0 } },
});

// 웹에서 realtime이 혹시 열리면 즉시 끊음
if (Platform.OS === 'web') {
  supabase.realtime.disconnect();
}

// ============================================
// 인증 관련 함수
// ============================================

/**
 * Google OAuth URL 생성 (native: skipBrowserRedirect, web: 직접 리다이렉트)
 */
export async function getGoogleOAuthUrl(redirectTo: string) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw new Error(error.message);
  return data.url;
}

/**
 * 이메일/비밀번호로 회원가입
 */
export async function signUpWithEmail(email: string, password: string, userData: any) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: userData,
    },
  });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 이메일/비밀번호로 로그인
 */
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 로그아웃
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

/**
 * 현재 세션 조회
 */
export async function getSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) throw new Error(error.message);
  return session;
}

/**
 * 현재 사용자 조회
 */
export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw new Error(error.message);
  return user;
}

/**
 * 비밀번호 재설정 이메일 발송
 */
export async function resetPassword(email: string) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.EXPO_PUBLIC_APP_URL || 'todak://reset-password'}`,
  });

  if (error) throw new Error(error.message);
  return data;
}

// ============================================
// 사용자 프로필 관련 함수
// ============================================

/**
 * 사용자 프로필 조회
 */
export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data; // null if no row exists
}

/**
 * 사용자 프로필 생성
 */
export async function createUserProfile(userId: string, profile: any) {
  const { data, error } = await supabase
    .from('users')
    .insert([{
      id: userId,
      ...profile,
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 사용자 프로필 업데이트
 */
export async function updateUserProfile(userId: string, profile: any) {
  const { error } = await supabase
    .from('users')
    .update(profile)
    .eq('id', userId);

  if (error) throw new Error(error.message);
}

/**
 * 상담사 프로필 사진 업로드 → Supabase Storage avatars 버킷
 * 반환: 공개 URL 문자열
 */
export async function uploadAvatarPhoto(userId: string, uri: string): Promise<string> {
  const ext = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `counselors/${userId}.${ext}`;

  // React Native에서는 fetch → blob 으로 변환 후 업로드
  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { contentType: mime, upsert: true });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

// ============================================
// 상담사 관련 함수
// ============================================

/**
 * 모든 상담사 조회 (가용한 상담사만)
 */
export async function getCounselors(limit: number = 10, page: number = 0) {
  const from = page * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('counselors')
    .select('*', { count: 'exact' })
    .eq('is_available', true)
    .range(from, to)
    .order('rating', { ascending: false });

  if (error) throw new Error(error.message);
  return { data, count };
}

/**
 * 상담사 상세 조회
 */
export async function getCounselorDetail(counselorId: string) {
  const { data, error } = await supabase
    .from('counselors')
    .select('*')
    .eq('id', counselorId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data; // null if no row yet
}

/**
 * 상담사 프로필 생성
 */
export async function createCounselorProfile(counselorId: string, profile: any) {
  const { data, error } = await supabase
    .from('counselors')
    .insert([{
      id: counselorId,
      ...profile,
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 상담사 프로필 업데이트 (row 없으면 기본값으로 생성, 있으면 전달된 필드만 업데이트)
 */
export async function updateCounselorProfile(counselorId: string, profile: any) {
  const now = new Date().toISOString();

  // 1. 존재 여부 먼저 확인 (SELECT만 — RLS 영향 최소화)
  const { data: existing, error: selectErr } = await supabase
    .from('counselors')
    .select('id')
    .eq('id', counselorId)
    .maybeSingle();

  if (selectErr) throw new Error(selectErr.message);

  if (existing) {
    // 2a. row 있음 → 전달된 필드만 UPDATE (기존 값 보존)
    const { error } = await supabase
      .from('counselors')
      .update({ ...profile, updated_at: now })
      .eq('id', counselorId);
    if (error) throw new Error(error.message);
  } else {
    // 2b. row 없음 → 기본값 + profile로 INSERT
    const { error } = await supabase
      .from('counselors')
      .insert({
        id:              counselorId,
        specialty:       [],
        rating:          0,
        review_count:    0,
        is_available:    false,
        is_certified:    false,
        hourly_rate:     19000,
        available_hours: {},
        bank_name:       null,
        account_number:  null,
        created_at:      now,
        ...profile,
        updated_at:      now,
      });
    if (error) throw new Error(error.message);
  }
}

// ============================================
// 예약 관련 함수
// ============================================

/**
 * 예약 생성
 */
export async function createBooking(booking: any) {
  const { data, error } = await supabase
    .from('bookings')
    .insert([{
      ...booking,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 사용자의 예약 목록 조회
 */
export async function getUserBookings(userId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, counselors(*), reviews(*)')
    .eq('user_id', userId)
    .order('scheduled_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 상담사의 예약 목록 조회
 */
export async function getCounselorBookings(counselorId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, users(*), reviews(*)')
    .eq('counselor_id', counselorId)
    .order('scheduled_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 예약 상태 업데이트
 */
export async function updateBookingStatus(bookingId: string, status: string, updates?: any) {
  const { data, error } = await supabase
    .from('bookings')
    .update({
      status,
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 예약 조회
 */
export async function getBooking(bookingId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, counselors(*), users(*), reviews(*)')
    .eq('id', bookingId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ============================================
// 리뷰 관련 함수
// ============================================

/**
 * 리뷰 생성
 */
export async function createReview(review: any) {
  const { data, error } = await supabase
    .from('reviews')
    .insert([{
      ...review,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 상담사의 리뷰 조회
 */
export async function getCounselorReviews(counselorId: string) {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('booking_id', counselorId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 리뷰 수정
 */
export async function updateReview(reviewId: string, updates: any) {
  const { data, error } = await supabase
    .from('reviews')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reviewId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ============================================
// 강의 관련 함수
// ============================================

/**
 * 모든 강의 조회
 */
export async function getCourses() {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .order('order_index', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 강의 상세 조회
 */
export async function getCourse(courseId: string) {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 상담사의 강의 진도 조회
 */
export async function getCounselorCourseProgress(counselorId: string) {
  const { data, error } = await supabase
    .from('counselor_courses')
    .select('*, courses(*)')
    .eq('counselor_id', counselorId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 강의 진도 업데이트
 */
export async function updateCourseProgress(
  counselorId: string,
  courseId: string,
  progress: number
) {
  const isCompleted = progress === 100;

  const { data, error } = await supabase
    .from('counselor_courses')
    .update({
      progress,
      completed_at: isCompleted ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('counselor_id', counselorId)
    .eq('course_id', courseId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 강의 수강 등록
 */
export async function enrollCourse(counselorId: string, courseId: string) {
  const { data, error } = await supabase
    .from('counselor_courses')
    .insert([{
      counselor_id: counselorId,
      course_id: courseId,
      progress: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ============================================
// 파일 업로드 (프로필 이미지 등)
// ============================================

/**
 * 파일을 Supabase Storage에 업로드
 */
export async function uploadFile(bucket: string, path: string, file: any) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
    });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 파일의 공개 URL 조회
 */
export function getPublicFileUrl(bucket: string, path: string) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// ============================================
// 실시간 구독
// ============================================

/**
 * 상담사 예약에 대한 실시간 구독
 */
export function subscribeToCounselorBookings(
  counselorId: string,
  callback: (payload: any) => void
) {
  const subscription = supabase
    .from(`bookings:counselor_id=eq.${counselorId}`)
    .on('*', (payload) => {
      callback(payload);
    })
    .subscribe();

  return subscription;
}

/**
 * 특정 예약에 대한 실시간 구독
 */
export function subscribeToBooking(bookingId: string, callback: (payload: any) => void) {
  const subscription = supabase
    .from(`bookings:id=eq.${bookingId}`)
    .on('*', (payload) => {
      callback(payload);
    })
    .subscribe();

  return subscription;
}

// ============================================
// 어드민 전용 함수 (role = 'admin' 인 사용자만 호출)
// ============================================

export async function adminGetStats() {
  const [users, counselors, bookings, settlements] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'counselor'),
    supabase.from('bookings').select('status, amount'),
    supabase.from('settlements').select('status, net_amount'),
  ]);

  const bookingRows = bookings.data ?? [];
  const settlementRows = settlements.data ?? [];

  return {
    totalUsers: users.count ?? 0,
    totalCounselors: counselors.count ?? 0,
    totalBookings: bookingRows.length,
    pendingBookings: bookingRows.filter((b: any) => b.status === 'pending').length,
    completedBookings: bookingRows.filter((b: any) => b.status === 'completed').length,
    totalRevenue: bookingRows
      .filter((b: any) => b.status === 'completed')
      .reduce((sum: number, b: any) => sum + (b.amount ?? 0), 0),
    pendingSettlements: settlementRows.filter((s: any) => s.status === 'pending').length,
  };
}

export async function adminGetAllCounselors() {
  const { data, error } = await supabase
    .from('counselors')
    .select('*, users(name, avatar_emoji, avatar_url)')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function adminToggleCounselorCertification(counselorId: string, value: boolean) {
  const { error } = await supabase
    .from('counselors')
    .update({ is_certified: value, updated_at: new Date().toISOString() })
    .eq('id', counselorId);
  if (error) throw new Error(error.message);
}

export async function adminToggleCounselorAvailability(counselorId: string, value: boolean) {
  const { error } = await supabase
    .from('counselors')
    .update({ is_available: value, updated_at: new Date().toISOString() })
    .eq('id', counselorId);
  if (error) throw new Error(error.message);
}

export async function adminCreateCourse(course: {
  title: string;
  description?: string;
  video_url?: string;
  duration_minutes: number;
  is_required: boolean;
  order_index: number;
}) {
  const { data, error } = await supabase
    .from('courses')
    .insert({ ...course, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function adminUpdateCourse(courseId: string, updates: Partial<{
  title: string;
  description: string;
  video_url: string;
  duration_minutes: number;
  is_required: boolean;
  order_index: number;
}>) {
  const { error } = await supabase
    .from('courses')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', courseId);
  if (error) throw new Error(error.message);
}

export async function adminDeleteCourse(courseId: string) {
  const { error } = await supabase.from('courses').delete().eq('id', courseId);
  if (error) throw new Error(error.message);
}

export async function adminGetNotices() {
  const { data, error } = await supabase
    .from('notices')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function adminCreateNotice(notice: {
  title: string;
  content: string;
  is_pinned?: boolean;
  target_role?: string;
}) {
  const { data, error } = await supabase
    .from('notices')
    .insert({ ...notice, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function adminUpdateNotice(noticeId: string, updates: Partial<{
  title: string;
  content: string;
  is_pinned: boolean;
  target_role: string;
}>) {
  const { error } = await supabase
    .from('notices')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', noticeId);
  if (error) throw new Error(error.message);
}

export async function adminDeleteNotice(noticeId: string) {
  const { error } = await supabase.from('notices').delete().eq('id', noticeId);
  if (error) throw new Error(error.message);
}

export async function adminGetSettlements() {
  const { data, error } = await supabase
    .from('settlements')
    .select('*, counselors(id, users(name))')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function adminUpdateSettlementStatus(settlementId: string, status: 'pending' | 'paid') {
  const { error } = await supabase
    .from('settlements')
    .update({ status, settled_at: status === 'paid' ? new Date().toISOString() : null })
    .eq('id', settlementId);
  if (error) throw new Error(error.message);
}

export async function adminGetAllUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export default supabase;
