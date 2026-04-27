import { create } from 'zustand';
import { User, UserRole } from '@/types';
import { Session } from '@supabase/supabase-js';
import {
  supabase,
  signUpWithEmail,
  signInWithEmail,
  signOut,
  getSession,
  getCurrentUser,
  getUserProfile,
  createUserProfile,
  updateUserProfile,
  createCounselorProfile,
} from '@/lib/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  needsOnboarding: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  listenForAuthChanges: () => () => void;
  signUp: (email: string, password: string, name: string, role: UserRole, avatarEmoji?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  finalizeGoogleSignIn: () => Promise<void>;
  completeOnboarding: (role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (profile: Partial<User>) => Promise<void>;
  clearError: () => void;
}

async function resolveProfile(authUser: { id: string; email?: string | null; user_metadata?: any }) {
  const profile = await getUserProfile(authUser.id);
  if (profile) return { user: profile as User, needsOnboarding: false };

  // users 테이블에 row 없음 → 온보딩 필요
  const meta = authUser.user_metadata ?? {};
  const partial: User = {
    id: authUser.id,
    name: meta.full_name ?? meta.name ?? authUser.email?.split('@')[0] ?? '사용자',
    role: 'user',
    avatar_emoji: '😊',
    created_at: new Date().toISOString(),
  };
  return { user: partial, needsOnboarding: true };
}

let _initialized = false;
let _initializing = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: false,
  error: null,
  needsOnboarding: false,
  initialized: false,

  initialize: async () => {
    // 이미 완료됐으면 React state만 동기화 (hot-reload 대응)
    if (_initialized || _initializing) {
      if (!get().initialized) set({ initialized: true });
      return;
    }
    _initializing = true;
    try {
      set({ loading: true, error: null });
      const session = await getSession();
      if (session?.user) {
        const { user, needsOnboarding } = await resolveProfile(session.user);
        set({ session, user, needsOnboarding });
      }
    } catch (e) {
      console.error('[auth] initialize error:', e);
    } finally {
      set({ loading: false, initialized: true });
      _initialized = true;
      _initializing = false;
    }
  },

  signUp: async (email, password, name, role, avatarEmoji) => {
    try {
      set({ loading: true, error: null });
      const result = await signUpWithEmail(email, password, { name, role, avatar_emoji: avatarEmoji });
      if (result.user) {
        const newUser: User = {
          id: result.user.id,
          name, role,
          avatar_emoji: avatarEmoji,
          created_at: new Date().toISOString(),
        };
        await createUserProfile(result.user.id, newUser);
        if (role === 'counselor') {
          await createCounselorProfile(result.user.id, {
            specialty: [], rating: 0, review_count: 0,
            is_available: false, is_certified: false,
            hourly_rate: 19000, available_hours: {},
            bank_name: null, account_number: null,
          }).catch(() => {});
        }
        set({ user: newUser, session: result.session, needsOnboarding: false });
      }
    } catch (error: any) {
      set({ error: error.message || '회원가입 실패' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  signIn: async (email, password) => {
    try {
      set({ loading: true, error: null });
      console.log('[auth] signIn: calling signInWithEmail');
      const result = await signInWithEmail(email, password);
      console.log('[auth] signIn: result user=', result.user?.id, 'session=', !!result.session);
      if (result.user && result.session) {
        console.log('[auth] signIn: calling resolveProfile');
        const { user, needsOnboarding } = await resolveProfile(result.user);
        console.log('[auth] signIn: resolved user=', user?.id, 'role=', user?.role, 'needsOnboarding=', needsOnboarding);
        set({ user, session: result.session, needsOnboarding, initialized: true });
      } else {
        console.warn('[auth] signIn: missing user or session', { user: result.user?.id, session: !!result.session });
      }
    } catch (error: any) {
      const message = error.message || '로그인 실패';
      console.error('[auth] signIn error:', message);
      set({ error: message });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  finalizeGoogleSignIn: async () => {
    try {
      set({ loading: true, error: null });
      const session = await getSession();
      if (!session?.user) throw new Error('세션을 가져올 수 없습니다');
      const { user, needsOnboarding } = await resolveProfile(session.user);
      set({ user, session, needsOnboarding, initialized: true });
    } catch (error: any) {
      set({ error: error.message || '구글 로그인 실패' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  completeOnboarding: async (role) => {
    try {
      set({ loading: true, error: null });
      const currentUser = get().user;
      const session = get().session;
      if (!currentUser?.id || !session) throw new Error('사용자 정보가 없습니다');

      const newUser: User = { ...currentUser, role };
      await createUserProfile(currentUser.id, newUser);
      if (role === 'counselor') {
        await createCounselorProfile(currentUser.id, {
          specialty: [], rating: 0, review_count: 0,
          is_available: false, is_certified: false,
          hourly_rate: 19000, available_hours: {},
          bank_name: null, account_number: null,
        }).catch(() => {});
      }
      set({ user: newUser, needsOnboarding: false });
    } catch (error: any) {
      set({ error: error.message || '온보딩 완료 실패' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    try {
      set({ loading: true, error: null });
      await signOut();
      _initialized = false;
      set({ user: null, session: null, needsOnboarding: false, initialized: true });
    } catch (error: any) {
      set({ error: error.message || '로그아웃 실패' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  updateProfile: async (profile) => {
    try {
      set({ loading: true, error: null });
      const currentUser = get().user;
      if (!currentUser?.id) throw new Error('사용자 정보가 없습니다');
      await updateUserProfile(currentUser.id, profile);
      set((state) => ({ user: state.user ? { ...state.user, ...profile } : null }));
    } catch (error: any) {
      set({ error: error.message || '프로필 업데이트 실패' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  clearError: () => set({ error: null }),

  listenForAuthChanges: () => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'INITIAL_SESSION') {
          console.log('[auth] INITIAL_SESSION: user=', session?.user?.id ?? 'none');
          // 앱 시작 시 현재 세션 상태 반영 + initialized 세팅
          if (session?.user) {
            if (get().user?.id === session.user.id && !get().needsOnboarding) {
              set({ initialized: true });
              return;
            }
            try {
              const { user, needsOnboarding } = await resolveProfile(session.user);
              console.log('[auth] INITIAL_SESSION: resolved role=', user?.role, 'needsOnboarding=', needsOnboarding);
              set({ session, user, needsOnboarding, initialized: true });
            } catch (e) {
              console.error('[auth] INITIAL_SESSION resolveProfile error:', e);
              set({ initialized: true });
            }
          } else {
            set({ initialized: true });
          }
          return;
        }

        if (event === 'SIGNED_IN' && session?.user) {
          console.log('[auth] SIGNED_IN: user=', session.user.id);
          // 이미 같은 유저로 세팅돼 있으면 중복 처리 방지
          if (get().user?.id === session.user.id && !get().needsOnboarding) {
            console.log('[auth] SIGNED_IN: skipped (already set)');
            return;
          }
          try {
            const { user, needsOnboarding } = await resolveProfile(session.user);
            console.log('[auth] SIGNED_IN: resolved role=', user?.role, 'needsOnboarding=', needsOnboarding);
            set({ session, user, needsOnboarding });
          } catch (e) {
            console.error('[auth] listenForAuthChanges SIGNED_IN error:', e);
          }
          return;
        }

        if (event === 'SIGNED_OUT') {
          _initialized = false;
          // initialized: true — auth state is known (no user); false would block _layout.tsx guard
          set({ user: null, session: null, needsOnboarding: false, initialized: true });
          return;
        }

        if (event === 'TOKEN_REFRESHED' && session) {
          set({ session });
        }
      }
    );
    return () => subscription.unsubscribe();
  },
}));
