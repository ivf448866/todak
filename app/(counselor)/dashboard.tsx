import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { getCounselorBookings } from '@/lib/supabase';
import { Booking } from '@/types';

interface DashboardStats {
  totalBookings: number;
  completedSessions: number;
  averageRating: number;
}

export default function CounselorDashboardScreen() {
  const router = useRouter();
  const { user, loading } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    if (user?.role !== 'counselor') {
      router.replace('/(user)');
      return;
    }

    fetchStats();
  }, [user]);

  const fetchStats = async () => {
    try {
      setLoadingStats(true);
      if (!user?.id) return;

      const bookingData = await getCounselorBookings(user.id);
      setBookings(bookingData || []);

      // 통계 계산
      const completed = (bookingData || []).filter((b) => b.status === 'completed').length;
      const avgRating =
        (bookingData || []).reduce((sum, b: any) => sum + (b.reviews?.[0]?.rating || 0), 0) /
        ((bookingData || []).length || 1) || 0;

      setStats({
        totalBookings: bookingData?.length || 0,
        completedSessions: completed,
        averageRating: Math.round(avgRating * 100) / 100,
      });
    } catch (error) {
      console.error('통계 조회 실패:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="px-4 py-6">
        {/* 환영 메시지 */}
        <View className="mb-6">
          <Text className="text-2xl font-bold text-gray-900">
            안녕하세요, {user?.name}님
          </Text>
          <Text className="text-sm text-gray-500 mt-2">
            경청사 대시보드
          </Text>
        </View>

        {/* 통계 섹션 */}
        {stats && (
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-900 mb-3">
              활동 통계
            </Text>
            <View className="flex-row gap-3">
              <View className="flex-1 bg-white rounded-lg p-4 shadow-sm">
                <Text className="text-gray-500 text-sm">전체 예약</Text>
                <Text className="text-2xl font-bold text-indigo-600 mt-1">
                  {stats.totalBookings}
                </Text>
              </View>
              <View className="flex-1 bg-white rounded-lg p-4 shadow-sm">
                <Text className="text-gray-500 text-sm">완료한 상담</Text>
                <Text className="text-2xl font-bold text-emerald-600 mt-1">
                  {stats.completedSessions}
                </Text>
              </View>
              <View className="flex-1 bg-white rounded-lg p-4 shadow-sm">
                <Text className="text-gray-500 text-sm">평점</Text>
                <Text className="text-2xl font-bold text-amber-500 mt-1">
                  ★ {stats.averageRating.toFixed(1)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* 액션 버튼들 */}
        <View className="gap-3">
          <TouchableOpacity
            onPress={() => router.push('/(counselor)/schedule')}
            className="bg-white rounded-lg p-4 flex-row items-center"
          >
            <View className="w-12 h-12 rounded-lg bg-indigo-100 items-center justify-center mr-4">
              <Text className="text-xl">📅</Text>
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-gray-900">스케줄 관리</Text>
              <Text className="text-sm text-gray-500 mt-1">가용 시간 설정</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(counselor)/education')}
            className="bg-white rounded-lg p-4 flex-row items-center"
          >
            <View className="w-12 h-12 rounded-lg bg-pink-100 items-center justify-center mr-4">
              <Text className="text-xl">📚</Text>
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-gray-900">교육 프로그램</Text>
              <Text className="text-sm text-gray-500 mt-1">필수 교육 이수</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(counselor)/stats')}
            className="bg-white rounded-lg p-4 flex-row items-center"
          >
            <View className="w-12 h-12 rounded-lg bg-amber-100 items-center justify-center mr-4">
              <Text className="text-xl">📊</Text>
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-gray-900">수익 통계</Text>
              <Text className="text-sm text-gray-500 mt-1">상세 통계 보기</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(counselor)/profile')}
            className="bg-white rounded-lg p-4 flex-row items-center"
          >
            <View className="w-12 h-12 rounded-lg bg-emerald-100 items-center justify-center mr-4">
              <Text className="text-xl">👤</Text>
            </View>
            <View className="flex-1">
              <Text className="font-semibold text-gray-900">프로필 관리</Text>
              <Text className="text-sm text-gray-500 mt-1">프로필 수정</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
