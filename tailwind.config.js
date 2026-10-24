/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Bright Spectrum Feature Palette
        blue: {
          DEFAULT: '#3B82F6',
          light: '#3B82F6',
          dark: '#60A5FA',
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },
        coral: {
          DEFAULT: '#FF6B57',
          light: '#FF6B57',
          dark: '#FF8A78',
          50: '#FFF5F3',
          100: '#FFEBE7',
          200: '#FFD4CD',
          300: '#FFAFA2',
          400: '#FF8A78',
          500: '#FF6B57',
          600: '#EE4F39',
          700: '#D83620',
          800: '#B82815',
          900: '#941E0F',
        },
        sun: {
          DEFAULT: '#FFB400',
          light: '#FFB400',
          dark: '#FFD166',
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FFD166',
          500: '#FFB400',
          600: '#D99B00',
          700: '#B48000',
          800: '#8C6400',
        },
        mint: {
          DEFAULT: '#14C38E',
          light: '#14C38E',
          dark: '#34E0B0',
          50: '#ECFDF5',
          100: '#D1FAE5',
          200: '#A7F3D0',
          300: '#6EE7B7',
          400: '#34E0B0',
          500: '#14C38E',
          600: '#0FA979',
          700: '#0A875F',
        },
        sky: {
          DEFAULT: '#22C5E8',
          light: '#22C5E8',
          dark: '#4DD8F5',
          50: '#F0FDFF',
          100: '#CFFAFE',
          200: '#A5F3FC',
          300: '#67E8F9',
          400: '#4DD8F5',
          500: '#22C5E8',
          600: '#0891B2',
          700: '#0E7490',
        },
        pink: {
          DEFAULT: '#EC4899',
          light: '#EC4899',
          dark: '#F472B6',
          50: '#FDF2F8',
          100: '#FCE7F3',
          200: '#FBCFE8',
          300: '#F9A8D4',
          400: '#F472B6',
          500: '#EC4899',
          600: '#DB2777',
          700: '#BE185D',
        },
        violet: {
          DEFAULT: '#8B5CF6',
          light: '#8B5CF6',
          dark: '#A78BFA',
          50: '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
        },

        // Primary Alias to Blue
        primary: {
          DEFAULT: '#3B82F6',
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1D4ED8',
          800: '#1E40AF',
          900: '#1E3A8A',
        },

        // Semantic Accents
        warm: {
          DEFAULT: '#FFB400', // Sun
          50: '#FFFBEB',
          100: '#FEF3C7',
          400: '#FFD166',
          500: '#FFB400',
        },
        cool: {
          DEFAULT: '#14C38E', // Mint
          50: '#ECFDF5',
          100: '#D1FAE5',
          400: '#34E0B0',
          500: '#14C38E',
        },
        accent: {
          DEFAULT: '#22C5E8', // Sky
          50: '#F0FDFF',
          100: '#CFFAFE',
          400: '#4DD8F5',
          500: '#22C5E8',
        },

        // Dark/Light Surface & Text Tokens
        ink: {
          DEFAULT: '#1B2559',
          navy: '#1B2559',
          light: '#1B2559',
          dark: '#F1F5FF',
          muted: '#6B7390',
          'muted-dark': '#9AA7CC',
          50: '#F1F5FF',
          100: '#E0E7FF',
          700: '#2B3760',
          800: '#1E2847', // Dark elevated
          900: '#161E36', // Dark surface
          950: '#0E1426', // Dark background
        },
        neutral: {
          bg: '#FBFAF7',
          surface: '#FFFFFF',
          border: '#E8E4DC',
          muted: '#6B7390',
        },
        destructive: {
          DEFAULT: '#FF6B57', // Coral
          50: '#FFF5F3',
          100: '#FFEBE7',
          400: '#FF8A78',
          500: '#FF6B57',
          600: '#EE4F39',
          700: '#D83620',
        }
      },
      backgroundImage: {
        'gradient-hero': 'linear-gradient(135deg, #3B82F6 0%, #22C5E8 100%)',
        'gradient-focus': 'linear-gradient(135deg, #FF6B57 0%, #FFB400 100%)',
        'gradient-planner': 'linear-gradient(135deg, #14C38E 0%, #22C5E8 100%)',
        'gradient-flashcard': 'linear-gradient(135deg, #FF6B57 0%, #EC4899 100%)',
        'gradient-streak': 'linear-gradient(135deg, #FFB400 0%, #FF6B57 100%)',
        'gradient-signature': 'linear-gradient(135deg, #3B82F6 0%, #22C5E8 100%)',
      },
      boxShadow: {
        'card': '0 2px 12px -2px rgba(27, 37, 89, 0.06)',
        'soft-violet': '0 2px 8px rgba(0, 0, 0, 0.06)',
        'glow-violet': '0 0 16px rgba(59, 130, 246, 0.25)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.25s ease-out',
        'slide-up': 'slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-subtle': 'pulse-subtle 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
