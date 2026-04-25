import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database';

// Supabase 클라이언트 초기화
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase 환경 변수가 설정되지 않았습니다.');
  console.warn('EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY를 .env.local에 설정하세요.');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// ============================================
// 인증 관련 함수
// ============================================

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
    .single();

  if (error) throw new Error(error.message);
  return data;
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
  const { data, error } = await supabase
    .from('users')
    .update(profile)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ============================================
// 경청사 관련 함수
// ============================================

/**
 * 모든 경청사 조회 (가용한 경청사만)
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
 * 경청사 상세 조회
 */
export async function getCounselorDetail(counselorId: string) {
  const { data, error } = await supabase
    .from('counselors')
    .select('*')
    .eq('id', counselorId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 경청사 프로필 생성
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
 * 경청사 프로필 업데이트
 */
export async function updateCounselorProfile(counselorId: string, profile: any) {
  const { data, error } = await supabase
    .from('counselors')
    .update({
      ...profile,
      updated_at: new Date().toISOString(),
    })
    .eq('id', counselorId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
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
 * 경청사의 예약 목록 조회
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
 * 경청사의 리뷰 조회
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
 * 경청사의 강의 진도 조회
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
 * 경청사 예약에 대한 실시간 구독
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

export default supabase;
