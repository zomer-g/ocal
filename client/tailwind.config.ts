import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Rubik',
          'Heebo',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      colors: {
        primary: {
          50:  '#E8F5F9',
          100: '#CCEBF3',
          200: '#9CD9EA',
          300: '#68C4DE',
          400: '#38AED0',
          500: '#1094B8',
          600: '#0A7A9A',
          700: '#06607C',
          800: '#044E66',
          900: '#003647',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
