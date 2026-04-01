import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Premium Color System
        brand: {
          50: '#F0F4F8',
          100: '#D9E2EC',
          200: '#BCCCDC',
          300: '#9FB3C8',
          400: '#829AB1',
          500: '#627D98',
          600: '#486581',
          700: '#334E68',
          800: '#243B53',
          900: '#102A43',
        },
        sapphire: {
          50: '#E6F6FF',
          100: '#BAE3FF',
          200: '#7CC4FA',
          300: '#47A3F3',
          400: '#2186EB',
          500: '#0967D2',
          600: '#0552B5',
          700: '#03449E',
          800: '#01337D',
          900: '#002159',
        },
        ai: {
          50: '#E0FCFF',
          100: '#BEF8FD',
          200: '#87EAF2',
          300: '#54D1DB',
          400: '#38BEC9',
          500: '#2CB1BC',
          600: '#14919B',
          700: '#0E7C86',
          800: '#0A6C74',
          900: '#044E54',
        },
        background: '#FAFBFC',
        surface: '#FFFFFF',
        border: '#E4E9F0',
      },
      borderRadius: {
        'premium': '12px',
        'premium-lg': '16px',
        'premium-xl': '20px',
      },
      boxShadow: {
        'elevation-1': '0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)',
        'elevation-2': '0 4px 12px rgba(15, 23, 42, 0.10), 0 2px 6px rgba(15, 23, 42, 0.06)',
        'elevation-3': '0 8px 16px rgba(15, 23, 42, 0.12), 0 4px 8px rgba(15, 23, 42, 0.08)',
        'elevation-4': '0 12px 24px rgba(15, 23, 42, 0.12), 0 6px 12px rgba(15, 23, 42, 0.08)',
        'elevation-5': '0 16px 32px rgba(15, 23, 42, 0.14), 0 8px 16px rgba(15, 23, 42, 0.10)',
        'glow-sm': '0 0 10px rgba(56, 190, 201, 0.15)',
        'glow-md': '0 0 20px rgba(56, 190, 201, 0.20)',
        'glow-lg': '0 0 30px rgba(56, 190, 201, 0.25)',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'kpi-hero': ['48px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'kpi-large': ['36px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' }],
        'kpi-medium': ['28px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'slide-up': 'slideUp 0.4s ease-out forwards',
        'scale-in': 'scaleIn 0.3s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
