/**
 * 토닥 데이터베이스 마이그레이션 스크립트
 * PostgreSQL + Supabase
 * 
 * 실행 방법:
 * 1. Supabase 대시보드 > SQL Editor에서 아래 쿼리 복사 및 실행
 * 2. 또는 supabase-cli를 사용하여 마이그레이션 파일로 관리
 */

-- ============================================
-- ENUM 타입 생성
-- ============================================
CREATE TYPE user_role AS ENUM ('user', 'counselor');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled');

-- ============================================
-- [테이블 1] users (사용자)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL,
  name TEXT NOT NULL,
  avatar_emoji TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT users_name_not_empty CHECK (name <> '')
);

-- ============================================
-- [테이블 2] counselors (경청사)
-- ============================================
CREATE TABLE IF NOT EXISTS counselors (
  id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  specialty TEXT[] DEFAULT '{}' CHECK (specialty <@ ARRAY['직장', '연애', '가족', '진로']),
  bio TEXT,
  rating NUMERIC(3, 2) DEFAULT 5.0 CHECK (rating >= 0 AND rating <= 5),
  review_count INT DEFAULT 0 CHECK (review_count >= 0),
  is_available BOOLEAN DEFAULT true,
  is_certified BOOLEAN DEFAULT false,
  hourly_rate INT DEFAULT 29000 CHECK (hourly_rate > 0),
  available_hours JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- [테이블 3] bookings (예약)
-- ============================================
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counselor_id UUID NOT NULL REFERENCES counselors(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INT DEFAULT 50 CHECK (duration_minutes > 0),
  status booking_status DEFAULT 'pending',
  amount INT NOT NULL CHECK (amount > 0),
  payment_key TEXT,
  room_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT booking_scheduled_not_null CHECK (scheduled_at IS NOT NULL)
);

-- ============================================
-- [테이블 4] reviews (리뷰)
-- ============================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE UNIQUE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- [테이블 5] courses (교육 과정)
-- ============================================
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),
  is_required BOOLEAN DEFAULT true,
  order_index INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT courses_title_not_empty CHECK (title <> '')
);

-- ============================================
-- [테이블 6] counselor_courses (경청사-강의 관계)
-- ============================================
CREATE TABLE IF NOT EXISTS counselor_courses (
  counselor_id UUID NOT NULL REFERENCES counselors(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  progress INT DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  PRIMARY KEY (counselor_id, course_id),
  CONSTRAINT progress_not_100_if_not_completed CHECK (
    (progress = 100 AND completed_at IS NOT NULL) OR 
    (progress < 100 AND completed_at IS NULL)
  )
);

-- ============================================
-- 인덱스 생성
-- ============================================
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_counselors_rating ON counselors(rating DESC);
CREATE INDEX IF NOT EXISTS idx_counselors_is_available ON counselors(is_available);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_counselor_id ON bookings(counselor_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_at ON bookings(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_reviews_booking_id ON reviews(booking_id);
CREATE INDEX IF NOT EXISTS idx_counselor_courses_counselor_id ON counselor_courses(counselor_id);
CREATE INDEX IF NOT EXISTS idx_counselor_courses_course_id ON counselor_courses(course_id);
CREATE INDEX IF NOT EXISTS idx_counselor_courses_progress ON counselor_courses(progress);

-- ============================================
-- 행 수준 보안 (RLS) 활성화
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE counselors ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE counselor_courses ENABLE ROW LEVEL SECURITY;

-- ============================================
-- [RLS 정책] users 테이블
-- ============================================
-- 정책 1: 인증된 사용자는 자신의 프로필만 조회 가능
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

-- 정책 2: 인증된 사용자는 자신의 정보만 수정 가능
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- 정책 3: 신규 가입자는 자신의 프로필만 생성 가능
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- [RLS 정책] counselors 테이블
-- ============================================
-- 정책 1: 모든 사용자(인증/미인증)는 경청사 정보 조회 가능
CREATE POLICY "Anyone can view counselors"
  ON counselors FOR SELECT
  USING (true);

-- 정책 2: 경청사는 자신의 정보만 수정 가능
CREATE POLICY "Counselors can update own profile"
  ON counselors FOR UPDATE
  USING (auth.uid() = id);

-- 정책 3: 사용자는 자신의 경청사 프로필만 생성 가능
CREATE POLICY "Counselors can insert own profile"
  ON counselors FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- [RLS 정책] bookings 테이블
-- ============================================
-- 정책 1: 해당 사용자 또는 경청사만 예약 조회 가능
CREATE POLICY "Users can view own bookings"
  ON bookings FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = counselor_id);

-- 정책 2: 사용자는 자신의 예약만 생성 가능
CREATE POLICY "Users can create own bookings"
  ON bookings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 정책 3: 경청사 또는 사용자는 자신의 예약만 수정 가능
CREATE POLICY "Booking participants can update bookings"
  ON bookings FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = counselor_id);

-- ============================================
-- [RLS 정책] reviews 테이블
-- ============================================
-- 정책 1: 모든 사용자는 리뷰 조회 가능
CREATE POLICY "Anyone can view reviews"
  ON reviews FOR SELECT
  USING (true);

-- 정책 2: 예약한 사용자만 리뷰 작성 가능
CREATE POLICY "Booking users can create reviews"
  ON reviews FOR INSERT
  WITH CHECK (
    auth.uid() = (
      SELECT user_id FROM bookings WHERE id = booking_id
    )
  );

-- 정책 3: 리뷰 작성자만 수정 가능
CREATE POLICY "Review authors can update reviews"
  ON reviews FOR UPDATE
  USING (
    auth.uid() = (
      SELECT user_id FROM bookings WHERE id = booking_id
    )
  );

-- ============================================
-- [RLS 정책] courses 테이블
-- ============================================
-- 정책 1: 모든 사용자는 강의 목록 조회 가능
CREATE POLICY "Anyone can view courses"
  ON courses FOR SELECT
  USING (true);

-- ============================================
-- [RLS 정책] counselor_courses 테이블
-- ============================================
-- 정책 1: 경청사는 자신의 강의 진도만 조회 가능
CREATE POLICY "Counselors can view own course progress"
  ON counselor_courses FOR SELECT
  USING (auth.uid() = counselor_id);

-- 정책 2: 경청사는 자신의 강의 진도만 수정 가능
CREATE POLICY "Counselors can update own course progress"
  ON counselor_courses FOR UPDATE
  USING (auth.uid() = counselor_id);

-- 정책 3: 경청사는 자신의 강의만 등록 가능
CREATE POLICY "Counselors can insert own course progress"
  ON counselor_courses FOR INSERT
  WITH CHECK (auth.uid() = counselor_id);

-- ============================================
-- 트리거 및 함수
-- ============================================

-- 함수 1: 경청사의 별점 자동 계산
CREATE OR REPLACE FUNCTION update_counselor_rating()
RETURNS TRIGGER AS $$
DECLARE
  new_rating NUMERIC;
  new_count INT;
BEGIN
  SELECT AVG(r.rating)::NUMERIC(3,2), COUNT(*) INTO new_rating, new_count
  FROM reviews r
  JOIN bookings b ON b.id = r.booking_id
  WHERE b.counselor_id = (
    SELECT counselor_id FROM bookings WHERE id = NEW.booking_id
  );

  UPDATE counselors
  SET rating = COALESCE(new_rating, 5.0),
      review_count = COALESCE(new_count, 0),
      updated_at = NOW()
  WHERE id = (
    SELECT counselor_id FROM bookings WHERE id = NEW.booking_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 1: 리뷰 생성/수정 시 경청사 별점 업데이트
CREATE TRIGGER trigger_update_counselor_rating
  AFTER INSERT OR UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_counselor_rating();

-- 함수 2: counselor_courses의 updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_counselor_courses_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 2: counselor_courses 업데이트 시 타임스탐프 갱신
CREATE TRIGGER trigger_update_counselor_courses_timestamp
  BEFORE UPDATE ON counselor_courses
  FOR EACH ROW
  EXECUTE FUNCTION update_counselor_courses_timestamp();

-- 함수 3: counselors의 updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_counselors_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 3: counselors 업데이트 시 타임스탐프 갱신
CREATE TRIGGER trigger_update_counselors_timestamp
  BEFORE UPDATE ON counselors
  FOR EACH ROW
  EXECUTE FUNCTION update_counselors_timestamp();

-- 함수 4: reviews의 updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_reviews_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 4: reviews 업데이트 시 타임스탐프 갱신
CREATE TRIGGER trigger_update_reviews_timestamp
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_reviews_timestamp();

-- 함수 5: bookings의 updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_bookings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 5: bookings 업데이트 시 타임스탐프 갱신
CREATE TRIGGER trigger_update_bookings_timestamp
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_bookings_timestamp();

-- ============================================
-- [알림] users 테이블에 Expo 푸시 토큰 컬럼 추가
-- ============================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS expo_push_token text;

-- ============================================
-- [알림] notification_log (중복 발송 방지)
-- ============================================
CREATE TABLE IF NOT EXISTS notification_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,
  type       text NOT NULL,
  sent_at    timestamptz DEFAULT now(),

  CONSTRAINT notification_log_unique UNIQUE (user_id, booking_id, type)
);

-- booking_id NULL인 경우(교육 알림 등)별도 UNIQUE 처리는
-- 애플리케이션 레이어에서 7일 TTL 쿼리로 관리
CREATE INDEX IF NOT EXISTS idx_notification_log_user_id  ON notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_type     ON notification_log(type);
CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at  ON notification_log(sent_at DESC);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification log"
  ON notification_log FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT는 Edge Function (service_role) 에서만 수행

-- ============================================
-- [정산] counselors 테이블에 계좌 컬럼 추가
-- ============================================
ALTER TABLE counselors
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS account_number text;

-- ============================================
-- [ENUM] settlement_status
-- ============================================
DO $$ BEGIN
  CREATE TYPE settlement_status AS ENUM ('pending', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- [테이블 7] settlements (정산)
-- ============================================
CREATE TABLE IF NOT EXISTS settlements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counselor_id   uuid NOT NULL REFERENCES counselors(id) ON DELETE CASCADE,
  period_start   date NOT NULL,
  period_end     date NOT NULL,
  total_sessions int  NOT NULL DEFAULT 0,
  gross_amount   int  NOT NULL DEFAULT 0,  -- 이용자 총 결제금액
  platform_fee   int  NOT NULL DEFAULT 0,  -- 플랫폼 수수료 (38%)
  net_amount     int  NOT NULL DEFAULT 0,  -- 경청사 수령액 (62%)
  status         settlement_status NOT NULL DEFAULT 'pending',
  bank_name      text,
  account_number text,
  settled_at     timestamptz,
  created_at     timestamptz DEFAULT now(),

  CONSTRAINT settlements_period_valid   CHECK (period_end >= period_start),
  CONSTRAINT settlements_amounts_valid  CHECK (gross_amount >= 0 AND net_amount >= 0 AND platform_fee >= 0),
  CONSTRAINT settlements_unique_period  UNIQUE (counselor_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_settlements_counselor_id  ON settlements(counselor_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status        ON settlements(status);
CREATE INDEX IF NOT EXISTS idx_settlements_period_start  ON settlements(period_start DESC);

ALTER TABLE settlements ENABLE ROW LEVEL SECURITY;

-- 경청사는 자신의 정산 내역만 조회 가능
CREATE POLICY "Counselors can view own settlements"
  ON settlements FOR SELECT
  USING (auth.uid() = counselor_id);

-- INSERT/UPDATE는 Edge Function (service_role) 에서만 수행 — RLS 우회

-- ============================================
-- pg_cron 설정 (Supabase Dashboard > Database > Extensions에서 활성화 후 실행)
-- 매주 월요일 00:00 UTC에 process-settlement Edge Function 호출
-- ============================================
-- SELECT cron.schedule(
--   'weekly-settlement',
--   '0 0 * * MON',
--   $$
--     SELECT net.http_post(
--       url     := current_setting('app.supabase_url') || '/functions/v1/process-settlement',
--       headers := jsonb_build_object(
--         'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
--         'Content-Type',  'application/json'
--       ),
--       body    := '{}'::jsonb
--     );
--   $$
-- );

-- ============================================
-- [테이블 8] crisis_alerts (위기 알림)
-- ============================================
CREATE TABLE IF NOT EXISTS crisis_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counselor_id  UUID NOT NULL REFERENCES counselors(id) ON DELETE CASCADE,
  booking_id    UUID REFERENCES bookings(id) ON DELETE SET NULL,
  user_message  TEXT NOT NULL,
  handled_at    TIMESTAMP WITH TIME ZONE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crisis_alerts_counselor_id ON crisis_alerts(counselor_id);
CREATE INDEX IF NOT EXISTS idx_crisis_alerts_handled_at  ON crisis_alerts(handled_at);

ALTER TABLE crisis_alerts ENABLE ROW LEVEL SECURITY;

-- 경청사는 자신에게 할당된 알림만 조회/수정 가능
CREATE POLICY "Counselors can view own crisis alerts"
  ON crisis_alerts FOR SELECT
  USING (auth.uid() = counselor_id);

CREATE POLICY "Counselors can update own crisis alerts"
  ON crisis_alerts FOR UPDATE
  USING (auth.uid() = counselor_id);

-- 이용자(또는 서비스 역할)가 INSERT — 채팅 전송 시 checkAndAlertCrisis() 호출
CREATE POLICY "Authenticated users can insert crisis alerts"
  ON crisis_alerts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ============================================
-- 인증 배지 자동 발급 트리거
-- ============================================

-- 함수 6: 필수 과정 100% 완료 시 counselors.is_certified = true 자동 설정
CREATE OR REPLACE FUNCTION check_certification()
RETURNS TRIGGER AS $$
DECLARE
  v_counselor_id UUID;
  v_required_total  INT;
  v_required_done   INT;
BEGIN
  v_counselor_id := NEW.counselor_id;

  -- 필수 과정 총 수
  SELECT COUNT(*) INTO v_required_total
  FROM courses
  WHERE is_required = true;

  -- 해당 경청사가 100% 완료한 필수 과정 수
  SELECT COUNT(*) INTO v_required_done
  FROM counselor_courses cc
  JOIN courses c ON c.id = cc.course_id
  WHERE cc.counselor_id = v_counselor_id
    AND c.is_required   = true
    AND cc.progress     = 100;

  -- 필수 과정이 1개 이상이고 모두 완료했을 때만 인증 부여
  IF v_required_total > 0 AND v_required_done >= v_required_total THEN
    UPDATE counselors
    SET is_certified = true,
        updated_at   = NOW()
    WHERE id = v_counselor_id
      AND is_certified = false;   -- 이미 인증된 경우 불필요한 UPDATE 방지
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 6: counselor_courses INSERT/UPDATE 후 인증 여부 재확인
CREATE TRIGGER trigger_check_certification
  AFTER INSERT OR UPDATE OF progress ON counselor_courses
  FOR EACH ROW
  WHEN (NEW.progress = 100)           -- progress 100 도달 시에만 실행
  EXECUTE FUNCTION check_certification();

-- ============================================
-- 댓글
-- ============================================
-- 초기 데이터: 필수 강의 과정 예제
-- INSERT INTO courses (title, description, duration_minutes, is_required, order_index) VALUES
-- ('경청 기초', '경청 상담의 기본 개념 학습', 120, true, 1),
-- ('소통 스킬', '효과적인 의사소통 기법', 90, true, 2),
-- ('위기 상담', '위기 상황 대응 방법', 60, false, 3);
