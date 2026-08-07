/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Playfair Display"', 'serif'],
      },
      colors: {
        // Backgrounds
        'bg-primary': '#F0F4F8',
        'bg-surface': '#FFFFFF',
        'bg-glass': 'rgba(255,255,255,0.72)',

        // Brand
        'brand-navy': '#143782',
        'brand-navy-light': '#1B2A6B',
        'brand-green': '#B4DC78',
        'brand-maroon': '#7B1F2E',
        'gold-cta': '#C9A84C',

        // Text
        'text-primary': '#0D1B3E',
        'text-secondary': '#4A5568',
        'text-muted': '#94A3B8',

        // Subject colors — mirrors mobile-app/lib/core/constants/subject_colors.dart
        'subject-english': '#2563EB',
        'subject-maths': '#7C3AED',
        'subject-science': '#0891B2',
        'subject-islamiat': '#D97706',
        'subject-urdu': '#DC2626',
        'subject-games': '#16A34A',
        'subject-geography': '#9333EA',
        'subject-cs': '#0F766E',
        'subject-history': '#B45309',
        'subject-default': '#475569',
      },
      boxShadow: {
        card: '0 2px 12px rgba(20,55,130,0.06)',
        sidebar: '4px 0 24px rgba(20,55,130,0.15)',
        drawer: '-20px 0 60px rgba(20,55,130,0.12)',
        luxe: '0 24px 80px rgba(20,55,130,0.12)',
      },
      backgroundImage: {
        'navy-gradient': 'linear-gradient(135deg, #143782, #1B2A6B)',
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
        30: '7.5rem',
      },
      letterSpacing: {
        luxe: '0.18em',
      },
    },
  },
  plugins: [],
};
