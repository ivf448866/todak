import { create } from 'zustand';
import { User, UserRole } from '@/types';
import { Session } from '@supabase/supabase-js';
import {
  signUpWithEmail,
  signInWithEmail,
  signOut,
  getSession,
  getCurrentUser,
  getUserProfile,
  createUserProfile,
  updateUserProfile,
} from '@/lib/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  signUp: (email: string, password: string, name: string, role: UserRole, avatarEmoji?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (profile: Partial<User>) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  error: null,

  initialize: async () => {
    try {
      set({ loading: true, error: null });
      const session = await getSession();

      if (session) {
        const authUser = await getCurrentUser();
        if (authUser?.id) {
          // users 테이블에서 실제 프로필 조회
          const profile = await getUserProfile(authUser.id).catch(() => null);
          set({ session, user: profile as User | null });
        }
      }
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      set({ error: '초기화 실패' });
    } finally {
      set({ loading: false });
    }
  },

  signUp: async (email: string, password: string, name: string, role: UserRole, avatarEmoji?: string) => {
    try {
      set({ loading: true, error: null });

      // Supabase Auth 회원가입
      const result = await signUpWithEmail(email, password, {
        name,
        role,
        avatar_emoji: avatarEmoji,
      });

      if (result.user) {
        const newUser: User = {
          id: result.user.id,
          name,
          role,
          avatar_emoji: avatarEmoji,
          created_at: new Date().toISOString(),
        };

        // users 테이블에 프로필 생성
        await createUserProfile(result.user.id, newUser);

        set({
          user: newUser,
          session: result.session,
        });
      }
    } catch (error: any) {
      const message = error.message || '회원가입 실패';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  signIn: async (email: string, password: string) => {
    try {
      set({ loading: true, error: null });
      const result = await signInWithEmail(email, password);

      if (result.user && result.session) {
        // user_metadata 의존 제거 — users 테이블에서 실제 프로필 조회
        const profile = await getUserProfile(result.user.id);
        set({ user: profile as User, session: result.session });
      }
    } catch (error: any) {
      const message = error.message || '로그인 실패';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    try {
      set({ loading: true, error: null });
      await signOut();
      set({
        user: null,
        session: null,
      });
    } catch (error: any) {
      const message = error.message || '로그아웃 실패';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  updateProfile: async (profile: Partial<User>) => {
    try {
      set({ loading: true, error: null });
      const currentUser = get().user;
      if (!currentUser?.id) throw new Error('사용자 정보가 없습니다');

      await updateUserProfile(currentUser.id, profile);
      set((state) => ({
        user: state.user ? { ...state.user, ...profile } : null,
      }));
    } catch (error: any) {
      const message = error.message || '프로필 업데이트 실패';
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
