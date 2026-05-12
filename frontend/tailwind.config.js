/**
 * Kuveyt Türk corporate palette.
 * Ana renkler: koyu yeşil (#006B3F) + altın (#C89B2F).
 * Resmi kurumsal renklerden (PMS 561 + PMS 124) türetilmiş yedek paletler.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kt: {
          green: {
            50:  '#ecf6f0',
            100: '#cfe7d6',
            200: '#9fcfac',
            300: '#6cb685',
            400: '#3a9c5d',
            500: '#0d8541',
            600: '#006B3F', // Kuveyt Türk ana yeşil
            700: '#005a35',
            800: '#00472a',
            900: '#003721',
            950: '#002317',
          },
          gold: {
            50:  '#fbf5e6',
            100: '#f4e6b8',
            200: '#ebd185',
            300: '#dfb952',
            400: '#d4a73a',
            500: '#C89B2F', // Kuveyt Türk altın
            600: '#a8801f',
            700: '#82621a',
            800: '#5d4612',
            900: '#3d2e0d',
          },
          cream:  '#fdfaf2',
          ivory:  '#f7f1e1',
          // Mekan render'larından türetilmiş yumuşak vurgular (secondary palette)
          sage: {
            50:  '#f1f4ef',
            100: '#dde5d6',
            200: '#b6c5ac',
            300: '#8ea683',
            400: '#6d8a63',
            500: '#536f4c',
          },
          coral: {
            50:  '#fdf2eb',
            100: '#fadcc7',
            200: '#f3b88f',
            300: '#ea9258',
            400: '#dd7331',
            500: '#c95c1f',
          },
          oak: {
            50:  '#faf5ee',
            100: '#efe1cb',
            200: '#dfc499',
            300: '#cba569',
            400: '#b88a47',
          },
          gray: {
            50:  '#f8f9f7',
            100: '#eef0eb',
            200: '#dde1d6',
            300: '#c0c5b6',
            400: '#8d958a',
            500: '#5d6557',
            600: '#414a3f',
            700: '#2a3128',
            800: '#1a201a',
            900: '#0e120e',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        'kt-soft':  '0 4px 20px rgba(0, 107, 63, 0.08)',
        'kt-card':  '0 8px 30px rgba(0, 107, 63, 0.14)',
        'kt-green': '0 6px 24px rgba(0, 107, 63, 0.35)',
        'kt-gold':  '0 6px 24px rgba(200, 155, 47, 0.35)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-gold': 'pulseGold 2s infinite',
        'ken-burns': 'kenBurns 24s ease-in-out infinite alternate',
        'mesh-shift': 'meshShift 18s ease-in-out infinite',
        'float-slow': 'floatSlow 8s ease-in-out infinite',
        'float-medium': 'floatSlow 6s ease-in-out infinite reverse',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(200, 155, 47, 0.5)' },
          '50%':      { boxShadow: '0 0 0 12px rgba(200, 155, 47, 0)' },
        },
        kenBurns: {
          '0%':   { transform: 'scale(1.05) translate(0, 0)' },
          '100%': { transform: 'scale(1.15) translate(-2%, 1%)' },
        },
        meshShift: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%':      { transform: 'translate(8%, -4%) scale(1.08)' },
          '66%':      { transform: 'translate(-4%, 6%) scale(0.95)' },
        },
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-20px)' },
        },
      },
    },
  },
  plugins: [],
};
