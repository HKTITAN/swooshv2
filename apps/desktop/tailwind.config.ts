import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/renderer/**/*.{html,ts,tsx,js,jsx,css}'],
  theme: {
    extend: {
      fontFamily: {
        baloo: ['"Baloo 2"', 'system-ui', 'sans-serif'],
        sans: ['"Baloo 2"', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Deep navy / jet base
        ink: {
          950: '#070A1B',
          900: '#0E1230',
          800: '#161B45',
          700: '#23295C',
          600: '#3A4280',
        },
        // Bright accents
        swoosh: {
          DEFAULT: '#3FE0C5', // signature mint
          50: '#E8FBF7',
          100: '#CCF7EE',
          200: '#9AEFDD',
          300: '#68E7CB',
          400: '#3FE0C5',
          500: '#1FC9AB',
          600: '#15A187',
          700: '#0F7B68',
        },
        flare: {
          DEFAULT: '#FF6B9D',
          50: '#FFE9F1',
          400: '#FF8FB3',
          500: '#FF6B9D',
          600: '#E8447F',
        },
        sun: {
          DEFAULT: '#FFD56B',
          400: '#FFE08C',
          500: '#FFD56B',
          600: '#E8B544',
        },
      },
      borderRadius: {
        pill: '9999px',
        panel: '24px',
        card: '16px',
      },
      boxShadow: {
        glow: '0 0 32px -8px rgba(63, 224, 197, 0.45)',
        panel: '0 24px 48px -16px rgba(7, 10, 27, 0.6)',
      },
      keyframes: {
        pulseRing: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.7' },
          '50%': { transform: 'scale(1.08)', opacity: '1' },
        },
      },
      animation: {
        pulseRing: 'pulseRing 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
