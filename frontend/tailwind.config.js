/** @type {import('tailwindcss').Config} */
import colors from 'tailwindcss/colors';

const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral greys instead of Tailwind's blue-tinted default.
        gray: colors.zinc,
        app: token('app'),
        surface: {
          DEFAULT: token('surface'),
          raised: token('raised'),
          overlay: token('overlay'),
        },
        border: {
          DEFAULT: token('border'),
          strong: token('border-strong'),
        },
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          soft: token('accent-soft'),
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', '"Cascadia Mono"', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', '14px'],
      },
      boxShadow: {
        pop: '0 0 0 1px rgb(255 255 255 / 0.06), 0 24px 64px -12px rgb(0 0 0 / 0.7), 0 8px 24px -8px rgb(0 0 0 / 0.5)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.5), 0 0 24px -4px rgb(var(--accent) / 0.45)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'slide-up': { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        blink: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0' } },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-6px)' },
          '40%, 80%': { transform: 'translateX(6px)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'pop-in': 'pop-in 160ms cubic-bezier(0.2, 0.9, 0.3, 1.2)',
        'slide-up': 'slide-up 200ms ease-out',
        blink: 'blink 1.1s steps(1) infinite',
        shake: 'shake 320ms ease-in-out',
      },
    },
  },
  plugins: [],
};
