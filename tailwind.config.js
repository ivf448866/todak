/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './global.css',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // EARME 커스텀 색상
        earme: {
          cream: '#faf8f5',      // 배경색 (크림 화이트)
          brown: '#3d2c1e',      // 주요색 (다크 브라운)
          gold: '#f0c98a',       // 강조색 (골드 앰버)
          gold_light: '#f5ddb5', // 약한 골드
          brown_light: '#5a4633', // 라이트 브라운
        },
        // 기본 색상들
        primary: '#6366f1', // Indigo
        secondary: '#ec4899', // Pink
        success: '#22c55e', // Green
        warning: '#f59e0b', // Amber
        danger: '#ef4444', // Red
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
      },
      spacing: {
        safe: 'max(1.5rem, env(safe-area-inset-bottom))',
      },
      fontFamily: {
        'noto-sans': ['"Noto Sans KR"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
