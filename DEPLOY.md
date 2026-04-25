# 토닥 배포 가이드

## 0. 사전 준비

```bash
# EAS CLI 설치
npm install -g eas-cli

# Expo 계정 로그인
eas login

# 프로젝트 초기화 (최초 1회)
eas init
# → app.json의 owner, extra.eas.projectId 자동 채워짐
```

## 1. 환경변수 설정

### 로컬 개발
```bash
cp .env.example .env.local
# .env.local에 실제 값 입력
```

### EAS 빌드 Secrets (CI/CD 빌드용)
```bash
# 클라이언트 공개 키 (EXPO_PUBLIC_* 접두사 → 번들에 포함됨)
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL       --value "https://xxxx.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY  --value "eyJhbGc..."
eas secret:create --scope project --name EXPO_PUBLIC_TOSS_CLIENT_KEY    --value "live_ck_..."

# 서버 전용 비밀 키 (절대 EXPO_PUBLIC_ 사용 금지)
eas secret:create --scope project --name TOSS_SECRET_KEY --value "live_sk_..."
eas secret:create --scope project --name DAILY_API_KEY   --value "..."
```

### Supabase Edge Function Secrets
```bash
# Supabase CLI로 설정 (자동 주입 제외한 키만)
supabase secrets set TOSS_SECRET_KEY=live_sk_...
supabase secrets set DAILY_API_KEY=...
```

## 2. 개발 빌드 (Development)

```bash
# iOS 시뮬레이터용 dev 클라이언트 빌드
eas build --profile development --platform ios

# Android dev 클라이언트 빌드
eas build --profile development --platform android

# 빌드 후 expo-go 대신 dev 클라이언트로 실행
npx expo start --dev-client
```

## 3. 내부 테스트 빌드 (Preview)

```bash
# iOS + Android 동시 빌드
eas build --profile preview --platform all

# 설치 링크를 팀원에게 공유 (EAS 대시보드 또는 QR)
eas build:list
```

## 4. 프로덕션 빌드 (Production)

```bash
# 스토어 제출용 빌드 (versionCode/buildNumber autoIncrement)
eas build --profile production --platform all

# 빌드 상태 확인
eas build:list --status finished

# App Store / Play Store 제출
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

## 5. OTA 업데이트 (EAS Update)

> JS 번들만 변경된 경우 스토어 재심사 없이 즉시 배포 가능

```bash
# preview 채널에 업데이트 배포
eas update --channel preview --message "버그 수정: 결제 화면"

# 프로덕션 채널에 업데이트 배포
eas update --channel production --message "v1.1.0 - 정산 화면 개선"

# 업데이트 목록 확인
eas update:list
```

## 6. Supabase Edge Functions 배포

```bash
# 개별 배포
supabase functions deploy post-payment
supabase functions deploy complete-session
supabase functions deploy process-settlement
supabase functions deploy schedule-reminders

# 전체 배포
supabase functions deploy
```

## 7. 필요한 assets 파일 목록

| 파일 | 크기 | 용도 |
|------|------|------|
| `assets/icon.png` | 1024×1024 | iOS/Android 앱 아이콘 |
| `assets/adaptive-icon.png` | 1024×1024 | Android 적응형 아이콘 (전경) |
| `assets/splash.png` | 1284×2778 | 스플래시 화면 |
| `assets/notification-icon.png` | 96×96 | Android 알림 아이콘 (흰색 단색) |
| `assets/favicon.png` | 32×32 | 웹 파비콘 |
| `google-services.json` | — | Android 푸시 알림 (Firebase) |
| `google-play-service-account.json` | — | Play Store 자동 배포용 |

> **notification-icon.png**: Android 알림 아이콘은 반드시 흰색 단색(알파 채널만 있는)
> PNG로 만들어야 합니다. 컬러 아이콘은 자동으로 회색으로 표시됩니다.

## 8. apple.json 업데이트 체크리스트

`app.json`에서 실제 값으로 교체해야 할 항목:

- `owner`: Expo 계정명
- `extra.eas.projectId`: `eas init` 실행 후 자동 생성
- `updates.url`: 위와 동일한 projectId로 수정
- `ios.associatedDomains`: 실제 도메인으로 변경
- `android.intentFilters.data.host`: 실제 도메인으로 변경

`eas.json`에서 실제 값으로 교체해야 할 항목:

- `submit.production.ios.appleId`: Apple ID 이메일
- `submit.production.ios.ascAppId`: App Store Connect 앱 ID
- `submit.production.ios.appleTeamId`: Apple Developer Team ID
