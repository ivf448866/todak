# 토닥 - 진짜 사람이 들어주는 경청 상담 앱

토닥은 이용자와 경청사(상담사)를 연결하는 풀스택 모바일 앱입니다. 실제 상담사와의 화상통화를 통해 전문적인 경청 상담을 받을 수 있습니다.

## 🎯 프로젝트 개요

- **유형**: React Native + Expo 풀스택 모바일 앱
- **타겟**: iOS, Android
- **구조**: 이용자 앱 + 경청사 앱 (각 그룹 레이아웃)

## 📱 기술 스택

### Frontend
- **Framework**: React Native (Expo SDK 51)
- **라우팅**: Expo Router (파일 기반 라우팅)
- **상태관리**: Zustand
- **스타일링**: NativeWind (Tailwind CSS for React Native)
- **언어**: TypeScript

### Backend
- **Database**: Supabase (PostgreSQL)
- **인증**: Supabase Auth
- **파일 저장**: Supabase Storage
- **실시간**: Supabase Realtime

### 주요 통합 서비스
- **결제**: Toss Payments SDK
- **화상통화**: Daily.co WebRTC SDK

## 📁 폴더 구조

```
todak/
├── app/
│   ├── _layout.tsx              # 루트 레이아웃
│   ├── (user)/                  # 이용자 앱 그룹
│   │   ├── _layout.tsx
│   │   ├── index.tsx            # 홈 (상담사 목록)
│   │   ├── counselor/[id].tsx   # 상담사 상세
│   │   ├── booking.tsx          # 예약
│   │   ├── session.tsx          # 상담 세션
│   │   └── mypage.tsx           # 마이페이지
│   └── (counselor)/             # 경청사 앱 그룹
│       ├── _layout.tsx
│       ├── dashboard.tsx        # 대시보드
│       ├── schedule.tsx         # 스케줄 관리
│       ├── education/
│       │   ├── index.tsx        # 교육 목록
│       │   └── [courseId].tsx   # 강의 뷰어
│       ├── stats.tsx            # 수익 통계
│       └── profile.tsx          # 프로필 관리
├── components/                  # 재사용 가능한 컴포넌트
├── lib/
│   ├── supabase.ts             # Supabase 클라이언트 및 함수
│   ├── toss.ts                 # 토스페이먼츠 통합
│   └── daily.ts                # Daily.co 화상통화 통합
├── stores/
│   ├── authStore.ts            # 인증 상태 관리
│   └── bookingStore.ts         # 예약 상태 관리
├── types/
│   └── index.ts                # TypeScript 타입 정의
├── app.json                    # Expo 설정
├── tsconfig.json               # TypeScript 설정
└── tailwind.config.js          # Tailwind CSS 설정
```

## 🚀 시작하기

### 사전 요구사항
- Node.js 18 이상
- npm 또는 yarn
- Expo CLI (`npm install -g expo-cli`)

### 설치

```bash
# 의존성 설치
npm install
# 또는
yarn install
```

### 환경 변수 설정

`.env.local` 파일을 생성하고 다음 정보를 추가하세요:

```env
# Supabase
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Daily.co
EXPO_PUBLIC_DAILY_API_KEY=your_daily_api_key

# Toss Payments
EXPO_PUBLIC_TOSS_CLIENT_KEY=your_toss_client_key

# App URLs
EXPO_PUBLIC_APP_URL=todak://
```

### 개발 서버 실행

```bash
# 모든 플랫폼에서 실행
npm start

# iOS 시뮬레이터
npm run ios

# Android 에뮬레이터
npm run android

# Web (테스트)
npm run web
```

## 📚 주요 파일 설명

### `lib/supabase.ts`
- Supabase 클라이언트 초기화
- 인증, 사용자 프로필, 예약, 세션 등의 CRUD 작업
- 실시간 구독 기능

### `stores/authStore.ts`
- Zustand를 사용한 인증 상태 관리
- 회원가입, 로그인, 로그아웃, 프로필 업데이트

### `stores/bookingStore.ts`
- 예약 관련 상태 관리
- 예약 생성, 조회, 상태 업데이트

### `lib/toss.ts`
- 토스페이먼츠 결제 API 통합
- 결제 요청, 확인, 취소, 조회

### `lib/daily.ts`
- Daily.co 화상통화 API 통합
- 룸 생성 및 관리
- 세션 토큰 생성
- 녹화 기능

## 🗄️ 데이터베이스 스키마

### 주요 테이블

#### `users`
- id, email, name, role, avatar_url, phone, created_at, updated_at

#### `counselors`
- id, bio, specialties, hourly_rate, rating, reviews_count, total_sessions, is_verified, license_number, profile_image_url

#### `bookings`
- id, user_id, counselor_id, scheduled_at, duration_minutes, status, amount, notes, created_at, updated_at

#### `sessions`
- id, booking_id, user_id, counselor_id, status, started_at, ended_at, room_url, recording_url, notes, created_at, updated_at

#### 기타 테이블
- `availability` - 경청사의 가용 시간
- `reviews` - 리뷰
- `education_courses` - 교육 과정
- `education_progress` - 교육 진도
- `payments` - 결제 내역
- `counselor_stats` - 경청사 통계

## 🔐 인증 흐름

1. 사용자가 이메일/비밀번호로 가입 또는 로그인
2. Supabase Auth에서 세션 토큰 발급
3. `useAuthStore`에서 사용자 정보 관리
4. Expo Router의 그룹 레이아웃을 통해 역할(user/counselor)에 따라 자동 라우팅

## 🎬 화상통화 흐름

1. 예약이 확정되면 Daily.co 룸 생성
2. 상담시간 저장 및 세션 생성
3. 양쪽 모두 앱 내에서 화상통화 시작
4. 통화 중 선택적 녹화
5. 통화 종료 후 녹화 파일 저장

## 💳 결제 흐름

1. 상담 예약 시 예약 금액 확정
2. 토스페이먼츠 위젝을 통해 결제 진행
3. 결제 완료 후 예약 상태 업데이트
4. 상담 완료 시 경청사에게 정산

## 📝 컨벤션

### 파일명
- 컴포넌트: PascalCase (e.g., `UserCard.tsx`)
- 유틸리티: camelCase (e.g., `formatDate.ts`)
- 페이지: camelCase or kebab-case (Expo Router 규칙 따름)

### 타입 정의
- 모든 타입은 `types/index.ts`에서 관리
- 외부 라이브러리 타입은 명시적으로 import

### 상태 관리
- Zustand store는 `stores/` 디렉토리에 위치
- 스토어 이름은 `*Store.ts` 형식

## 🧪 테스트

```bash
npm test
```

## 📦 빌드

### 프로덕션 빌드
```bash
# iOS
eas build --platform ios

# Android
eas build --platform android
```

## 🔧 문제 해결

### 의존성 문제
```bash
npm install --force
# 또는
rm -rf node_modules package-lock.json && npm install
```

### TypeScript 에러
```bash
tsc --noEmit
```

### Expo 캐시 초기화
```bash
expo start -c
```

## 📞 지원

문제가 발생하면 GitHub Issues에 보고해주세요.

## 📄 라이센스

MIT License

## 👥 기여

기여는 언제나 환영합니다! PR을 보내주세요.

---

**마지막 업데이트**: 2026년 4월
