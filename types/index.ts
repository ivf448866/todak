// ============================================
// 토닥 타입 정의
// ============================================

// ========== 사용자 역할 ==========
export type UserRole = 'user' | 'counselor';
export type BookingStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type Specialty = '직장' | '연애' | '가족' | '진로';

// ========== 기본 사용자 ==========
export interface User {
  id: string;
  role: UserRole;
  name: string;
  avatar_emoji?: string | null;
  created_at: string;
}

// ========== 경청사 정보 ==========
export interface Counselor extends User {
  role: 'counselor';
  specialty: Specialty[];
  bio?: string | null;
  rating: number; // 0~5.00
  review_count: number;
  is_available: boolean;
  is_certified: boolean;
  hourly_rate: number;
  available_hours: {
    [key: string]: string[]; // {"mon": ["10:00","11:00"], "tue": [...]}
  };
  bank_name: string | null;
  account_number: string | null;
  created_at: string;
  updated_at: string;
}

// ========== 이용자 정보 ==========
export interface UserProfile extends User {
  role: 'user';
  created_at: string;
}

// ========== 예약 ==========
export interface Booking {
  id: string;
  user_id: string;
  counselor_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: BookingStatus;
  amount: number;
  payment_key?: string | null;
  room_url?: string | null;
  created_at: string;
  updated_at: string;
}

// ========== 예약 상세 (관계 포함) ==========
export interface BookingWithDetails extends Booking {
  user?: User;
  counselor?: Counselor;
}

// ========== 리뷰 ==========
export interface Review {
  id: string;
  booking_id: string;
  rating: number; // 1~5
  comment?: string | null;
  created_at: string;
  updated_at: string;
}

// ========== 강의 ==========
export interface Course {
  id: string;
  title: string;
  description?: string | null;
  video_url?: string | null;
  duration_minutes: number;
  is_required: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

// ========== 경청사 강의 진도 ==========
export interface CounselorCourse {
  counselor_id: string;
  course_id: string;
  progress: number; // 0~100
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ========== 경청사 강의 진도 상세 ==========
export interface CounselorCourseWithDetails extends CounselorCourse {
  course?: Course;
}

// ========== 홈 화면 경청사 목록 (users 조인) ==========
export interface CounselorListItem {
  id: string;
  name: string;
  avatar_emoji: string | null;
  specialty: Specialty[];
  bio: string | null;
  rating: number;
  review_count: number;
  is_available: boolean;
  is_certified: boolean;
}

// ========== 정산 ==========
export type SettlementStatus = 'pending' | 'paid';

export interface Settlement {
  id: string;
  counselor_id: string;
  period_start: string;   // 'YYYY-MM-DD'
  period_end: string;     // 'YYYY-MM-DD'
  total_sessions: number;
  gross_amount: number;
  platform_fee: number;
  net_amount: number;
  status: SettlementStatus;
  bank_name: string | null;
  account_number: string | null;
  settled_at: string | null;
  created_at: string;
}

// ========== API 응답 타입 ==========
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// ========== 인증 세션 ==========
export interface AuthSession {
  user: User | null;
  session: any; // Supabase session
  loading: boolean;
  error?: string;
}
