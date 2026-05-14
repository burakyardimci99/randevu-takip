/**
 * AI Lab — Fütüristik Yapay Zeka teması.
 *
 * Logo'dan türetilen palette:
 *  - Primary: Electric cyan/blue circuit pattern (#06B6D4 → #0EA5E9 → #3B82F6)
 *  - Background: Deep navy (#0A1628 → #0F1E3D → #1E293B)
 *  - Accent / glow: Bright cyan (#22D3EE, #67E8F9) — neural parıltı
 *  - Magenta/violet hint: AI/ML çağrışımı (#A855F7) — secondary accent
 *
 * NOT: Eski `kt-*` class isimleri korundu (büyük refactor önlendi); değerleri
 * yeniden tanımlandı. Geriye dönük uyumluluk için `kt-green-*` artık koyu
 * navy/cyan, `kt-gold-*` ise bright cyan glow rolünde.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kt: {
          /**
           * Primary brand color (eski "yeşil" — şimdi deep navy + electric blue).
           * 50-300: hafif backgrounds, 400-600: mid accents, 700-950: deep navy.
           */
          green: {
            50:  '#ecf6ff', // soft sky tint
            100: '#d0e8ff',
            200: '#a1d1ff',
            300: '#6ab5ff',
            400: '#3b96f5',
            500: '#1e7ce0', // mid electric blue
            600: '#0EA5E9', // ana cyan-blue (logo primary)
            700: '#0369a1', // deep cyan-blue
            800: '#1E293B', // dark navy (card bg dark mode)
            900: '#0F1E3D', // very deep navy (text/headings)
            950: '#0A1628', // near-black navy
          },
          /**
           * Accent glow color (eski "altın" — şimdi bright cyan/teal glow).
           * Highlight, badge, focus ring için kullanılır.
           */
          gold: {
            50:  '#ecfeff', // hint of cyan
            100: '#cffafe',
            200: '#a5f3fc',
            300: '#67E8F9', // logo glow accent
            400: '#22D3EE', // ana glow (logo'daki yıldızlar)
            500: '#06B6D4', // primary cyan
            600: '#0891B2',
            700: '#0e7490',
            800: '#155e75',
            900: '#164e63',
          },
          /**
           * Secondary AI vibe — violet/magenta hint (sadece highlight'larda).
           */
          violet: {
            50:  '#f5f3ff',
            100: '#ede9fe',
            300: '#c4b5fd',
            500: '#A855F7',
            600: '#9333ea',
            700: '#7e22ce',
          },
          cream:  '#f0f9ff', // çok hafif blue tint (eski cream)
          ivory:  '#e0f2fe',
          // Mekan render'larından türetilmiş yumuşak vurgular
          sage: {
            50:  '#eff6ff',
            100: '#dbeafe',
            200: '#bfdbfe',
            300: '#93c5fd',
            400: '#60a5fa',
            500: '#3b82f6',
          },
          coral: {
            50:  '#fdf2f8',
            100: '#fce7f3',
            200: '#fbcfe8',
            300: '#f9a8d4',
            400: '#ec4899',
            500: '#db2777',
          },
          oak: {
            50:  '#f1f5f9',
            100: '#e2e8f0',
            200: '#cbd5e1',
            300: '#94a3b8',
            400: '#64748b',
          },
          /**
           * Gri — sıcak yeşil-grilerden soğuk slate-blue grilere geçti.
           */
          gray: {
            50:  '#f8fafc', // app background
            100: '#f1f5f9',
            200: '#e2e8f0',
            300: '#cbd5e1',
            400: '#94a3b8',
            500: '#64748b',
            600: '#475569',
            700: '#334155',
            800: '#1e293b',
            900: '#0f172a',
          },
        },
        /**
         * Yeni semantic isimler — gelecekte refactor için tercih edilen.
         */
        ai: {
          glow:   '#22D3EE',
          cyan:   '#06B6D4',
          blue:   '#0EA5E9',
          deep:   '#0A1628',
          dark:   '#0F1E3D',
          accent: '#67E8F9',
          violet: '#A855F7',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        // Soft glow shadows — AI/neural vibe
        'kt-soft':  '0 4px 20px rgba(14, 165, 233, 0.10)',
        'kt-card':  '0 8px 30px rgba(14, 165, 233, 0.18)',
        'kt-green': '0 6px 24px rgba(14, 165, 233, 0.45)',
        'kt-gold':  '0 6px 24px rgba(34, 211, 238, 0.50)',
        // Yeni: neon glow
        'glow-cyan':    '0 0 20px rgba(34, 211, 238, 0.6), 0 0 40px rgba(34, 211, 238, 0.3)',
        'glow-blue':    '0 0 20px rgba(14, 165, 233, 0.6), 0 0 40px rgba(14, 165, 233, 0.3)',
        'glow-violet':  '0 0 20px rgba(168, 85, 247, 0.5), 0 0 40px rgba(168, 85, 247, 0.25)',
        'inset-glow':   'inset 0 0 16px rgba(34, 211, 238, 0.25)',
        'neon-edge':    '0 0 0 1px rgba(34, 211, 238, 0.4), 0 0 24px rgba(34, 211, 238, 0.35)',
      },
      backgroundImage: {
        // Reusable gradient'lar
        'ai-hero':       'linear-gradient(135deg, #0A1628 0%, #0F1E3D 35%, #1E40AF 70%, #06B6D4 100%)',
        'ai-mesh':       'radial-gradient(at 20% 30%, rgba(34, 211, 238, 0.20) 0%, transparent 50%), radial-gradient(at 80% 70%, rgba(168, 85, 247, 0.18) 0%, transparent 50%), radial-gradient(at 50% 50%, rgba(14, 165, 233, 0.12) 0%, transparent 60%)',
        'ai-glow-btn':   'linear-gradient(135deg, #06B6D4 0%, #0EA5E9 50%, #3B82F6 100%)',
        'ai-glow-soft':  'linear-gradient(135deg, rgba(34, 211, 238, 0.15) 0%, rgba(168, 85, 247, 0.10) 100%)',
        'ai-card-dark':  'linear-gradient(180deg, #1E293B 0%, #0F1E3D 100%)',
        'ai-grid':       'linear-gradient(rgba(34, 211, 238, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 211, 238, 0.08) 1px, transparent 1px)',
      },
      animation: {
        'fade-in':       'fadeIn 0.4s ease-out',
        'slide-up':      'slideUp 0.4s ease-out',
        'pulse-gold':    'pulseGold 2s infinite',
        'ken-burns':     'kenBurns 24s ease-in-out infinite alternate',
        'mesh-shift':    'meshShift 18s ease-in-out infinite',
        'float-slow':    'floatSlow 8s ease-in-out infinite',
        'float-medium':  'floatSlow 6s ease-in-out infinite reverse',
        // Yeni AI animasyonlar
        'glow-pulse':    'glowPulse 3s ease-in-out infinite',
        'neural-flow':   'neuralFlow 12s linear infinite',
        'scan-line':     'scanLine 3s linear infinite',
        'circuit-trace': 'circuitTrace 4s ease-in-out infinite',
        'orbit':         'orbit 20s linear infinite',
        'shimmer':       'shimmer 2.5s linear infinite',
        'spotlight':     'spotlight 2s ease .75s 1 forwards',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(12px)', opacity: '0' },
          to:   { transform: 'translateY(0)',     opacity: '1' },
        },
        pulseGold: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(34, 211, 238, 0.55)' },
          '50%':      { boxShadow: '0 0 0 14px rgba(34, 211, 238, 0)' },
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
        glowPulse: {
          '0%, 100%': {
            boxShadow: '0 0 20px rgba(34, 211, 238, 0.4), 0 0 40px rgba(34, 211, 238, 0.2)',
          },
          '50%': {
            boxShadow: '0 0 32px rgba(34, 211, 238, 0.7), 0 0 60px rgba(34, 211, 238, 0.4)',
          },
        },
        neuralFlow: {
          '0%':   { backgroundPosition: '0% 0%, 0% 0%' },
          '100%': { backgroundPosition: '40px 40px, 40px 40px' },
        },
        scanLine: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        circuitTrace: {
          '0%':   { strokeDashoffset: '100' },
          '100%': { strokeDashoffset: '0' },
        },
        orbit: {
          '0%':   { transform: 'rotate(0deg) translateX(40px) rotate(0deg)' },
          '100%': { transform: 'rotate(360deg) translateX(40px) rotate(-360deg)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        spotlight: {
          '0%':   { opacity: '0', transform: 'translate(-72%, -62%) scale(0.5)' },
          '100%': { opacity: '1', transform: 'translate(-50%, -40%) scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
