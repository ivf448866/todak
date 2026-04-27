/**
 * Supabase 데이터베이스 타입 정의
 * 
 * 실제 프로젝트에서는 Supabase CLI를 사용하여 자동 생성하는 것이 권장됩니다:
 * supabase gen types typescript --local > types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type UserRole = 'user' | 'counselor' | 'admin';
export type BookingStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type Specialty = '직장' | '연애' | '가족' | '진로';

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          role: UserRole;
          name: string;
          avatar_emoji: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          role: UserRole;
          name: string;
          avatar_emoji?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          role?: UserRole;
          name?: string;
          avatar_emoji?: string | null;
          created_at?: string;
        };
      };

      counselors: {
        Row: {
          id: string;
          specialty: Specialty[];
          bio: string | null;
          rating: number; // numeric(3,2)
          review_count: number;
          is_available: boolean;
          is_certified: boolean;
          hourly_rate: number;
          available_hours: Json; // JSONB
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          specialty?: Specialty[];
          bio?: string | null;
          rating?: number;
          review_count?: number;
          is_available?: boolean;
          is_certified?: boolean;
          hourly_rate?: number;
          available_hours?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          specialty?: Specialty[];
          bio?: string | null;
          rating?: number;
          review_count?: number;
          is_available?: boolean;
          is_certified?: boolean;
          hourly_rate?: number;
          available_hours?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };

      bookings: {
        Row: {
          id: string;
          user_id: string;
          counselor_id: string;
          scheduled_at: string;
          duration_minutes: number;
          status: BookingStatus;
          amount: number;
          payment_key: string | null;
          room_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          counselor_id: string;
          scheduled_at: string;
          duration_minutes?: number;
          status?: BookingStatus;
          amount: number;
          payment_key?: string | null;
          room_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          counselor_id?: string;
          scheduled_at?: string;
          duration_minutes?: number;
          status?: BookingStatus;
          amount?: number;
          payment_key?: string | null;
          room_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      reviews: {
        Row: {
          id: string;
          booking_id: string;
          rating: number; // 1-5
          comment: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          rating: number;
          comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          rating?: number;
          comment?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };

      courses: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          video_url: string | null;
          duration_minutes: number;
          is_required: boolean;
          order_index: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          video_url?: string | null;
          duration_minutes: number;
          is_required?: boolean;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          video_url?: string | null;
          duration_minutes?: number;
          is_required?: boolean;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
      };

      counselor_courses: {
        Row: {
          counselor_id: string;
          course_id: string;
          progress: number; // 0-100
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          counselor_id: string;
          course_id: string;
          progress?: number;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          counselor_id?: string;
          course_id?: string;
          progress?: number;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      [_ in never]: never;
    };

    Enums: {
      user_role: UserRole;
      booking_status: BookingStatus;
    };
  };
}

