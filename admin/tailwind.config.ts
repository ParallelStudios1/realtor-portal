import type { Config } from 'tailwindcss';

/**
 * Design tokens for Realtor Portal.
 *
 * - Inter as the body font (loaded via next/font in app/layout.tsx).
 * - Custom shadow scale tuned for soft, modern card surfaces. Tailwind's
 *   default shadows are too "punchy" for a SaaS dashboard.
 * - Brand color scale we can use anywhere (bg-brand-50 ... bg-brand-900).
 * - Custom keyframes for the small motion polish on hovers + page enters.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'var(--font-inter)',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        // Brand neutral scale used across surfaces. Mirrors slate but kept
        // separate so we can re-tone the product without touching slate.
        ink: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
          950: '#020617',
        },
      },
      boxShadow: {
        // Layered, soft shadows. The 1px ring of color at 0 0 0 1px gives
        // us a hairline border without using border-width.
        'soft-xs': '0 1px 2px 0 rgb(15 23 42 / 0.05)',
        'soft-sm':
          '0 1px 2px 0 rgb(15 23 42 / 0.06), 0 1px 1px 0 rgb(15 23 42 / 0.04)',
        soft:
          '0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.06)',
        'soft-md':
          '0 4px 12px -2px rgb(15 23 42 / 0.06), 0 2px 4px -2px rgb(15 23 42 / 0.04)',
        'soft-lg':
          '0 12px 24px -8px rgb(15 23 42 / 0.10), 0 6px 12px -6px rgb(15 23 42 / 0.06)',
        'soft-xl':
          '0 24px 48px -12px rgb(15 23 42 / 0.14), 0 10px 20px -8px rgb(15 23 42 / 0.06)',
        ring: '0 0 0 1px rgb(15 23 42 / 0.08)',
        'ring-lg': '0 0 0 1px rgb(15 23 42 / 0.12)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(2px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.5' },
          '50%': { transform: 'scale(1.05)', opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.4, 0, 0.2, 1) both',
        'slide-up': 'slide-up 240ms cubic-bezier(0.4, 0, 0.2, 1) both',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
      },
      transitionTimingFunction: {
        snap: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
