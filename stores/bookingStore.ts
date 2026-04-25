import { create } from 'zustand';
import { Booking, BookingStatus } from '@/types';
import {
  createBooking,
  getUserBookings,
  getCounselorBookings,
  getBooking,
  updateBookingStatus,
} from '@/lib/supabase';

interface BookingState {
  bookings: Booking[];
  selectedBooking: Booking | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchUserBookings: (userId: string) => Promise<void>;
  fetchCounselorBookings: (counselorId: string) => Promise<void>;
  fetchBooking: (bookingId: string) => Promise<void>;
  createNewBooking: (booking: Omit<Booking, 'id' | 'created_at' | 'updated_at'>) => Promise<Booking>;
  updateStatus: (bookingId: string, status: BookingStatus, updates?: any) => Promise<void>;
  selectBooking: (booking: Booking | null) => void;
  clearError: () => void;
}

export const useBookingStore = create<BookingState>((set) => ({
  bookings: [],
  selectedBooking: null,
  loading: false,
  error: null,

  fetchUserBookings: async (userId: string) => {
    try {
      set({ loading: true, error: null });
      const bookings = await getUserBookings(userId);
      set({ bookings: bookings || [] });
    } catch (error: any) {
      set({ error: error.message || '예약 조회 실패' });
    } finally {
      set({ loading: false });
    }
  },

  fetchCounselorBookings: async (counselorId: string) => {
    try {
      set({ loading: true, error: null });
      const bookings = await getCounselorBookings(counselorId);
      set({ bookings: bookings || [] });
    } catch (error: any) {
      set({ error: error.message || '예약 조회 실패' });
    } finally {
      set({ loading: false });
    }
  },

  fetchBooking: async (bookingId: string) => {
    try {
      set({ loading: true, error: null });
      const booking = await getBooking(bookingId);
      set({ selectedBooking: booking });
    } catch (error: any) {
      set({ error: error.message || '예약 조회 실패' });
    } finally {
      set({ loading: false });
    }
  },

  createNewBooking: async (booking) => {
    try {
      set({ loading: true, error: null });
      const newBooking = await createBooking(booking);

      set((state) => ({
        bookings: [newBooking, ...state.bookings],
      }));

      return newBooking;
    } catch (error: any) {
      set({ error: error.message || '예약 생성 실패' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  updateStatus: async (bookingId: string, status: BookingStatus, updates?: any) => {
    try {
      set({ loading: true, error: null });
      await updateBookingStatus(bookingId, status, updates);

      set((state) => ({
        bookings: state.bookings.map((b) =>
          b.id === bookingId
            ? {
                ...b,
                status,
                ...updates,
              }
            : b
        ),
        selectedBooking:
          state.selectedBooking?.id === bookingId
            ? {
                ...state.selectedBooking,
                status,
                ...updates,
              }
            : state.selectedBooking,
      }));
    } catch (error: any) {
      set({ error: error.message || '예약 상태 업데이트 실패' });
      throw error;
    } finally {
      set({ loading: false });
    }
  },

  selectBooking: (booking) => set({ selectedBooking: booking }),

  clearError: () => set({ error: null }),
}));
