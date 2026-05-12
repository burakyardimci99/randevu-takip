/**
 * Her oda için tematik AI/teknoloji illüstrasyonu (inline SVG).
 *
 * Tüm SVG'ler brand renklerinde (kt-green + kt-gold) tasarlandı.
 * Stil: abstrakt, gradient zemin + merkezi sembolik figür.
 * Card header'ında arka plan olarak kullanılır.
 */
import type { RoomTheme } from '../types';

interface Props {
  theme: RoomTheme;
  className?: string;
}

export function RoomIllustration({ theme, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* Brand-uyumlu gradient zeminler (her tema için bir renk kayması) */}
        <linearGradient id={`bg-${theme}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={GRADIENTS[theme].from} />
          <stop offset="100%" stopColor={GRADIENTS[theme].to} />
        </linearGradient>
        <radialGradient id={`glow-${theme}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#C89B2F" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#C89B2F" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Arka plan */}
      <rect width="400" height="200" fill={`url(#bg-${theme})`} />
      {/* Hafif altın parıltı */}
      <circle cx="280" cy="60" r="120" fill={`url(#glow-${theme})`} />
      {/* Noktalı pattern */}
      <g opacity="0.08" fill="#fff">
        {Array.from({ length: 40 }).map((_, i) => {
          const x = (i % 10) * 40 + 20;
          const y = Math.floor(i / 10) * 50 + 25;
          return <circle key={i} cx={x} cy={y} r="1.2" />;
        })}
      </g>

      {/* Tema spesifik illüstrasyon */}
      <g transform="translate(200 100)">{RENDERERS[theme]()}</g>
    </svg>
  );
}

const GRADIENTS: Record<RoomTheme, { from: string; to: string }> = {
  robot:   { from: '#00472a', to: '#005a35' },
  pc:      { from: '#005a35', to: '#003721' },
  neural:  { from: '#003721', to: '#00673f' },
  chatbot: { from: '#00472a', to: '#0d8541' },
  data:    { from: '#005a35', to: '#82621a' },
  brain:   { from: '#00673f', to: '#00472a' },
  code:    { from: '#003721', to: '#005a35' },
  cloud:   { from: '#00472a', to: '#00673f' },
  vector:  { from: '#005a35', to: '#a8801f' },
  agent:   { from: '#003721', to: '#0d8541' },
};

const GOLD = '#dfb952';
const GOLD_DARK = '#a8801f';
const WHITE = '#ffffff';

/* ============================================================
 * 10 TEMA İLLÜSTRASYONU
 * Her biri (0,0) merkezli, ~150×150 alanı kaplar.
 * ============================================================ */

const RENDERERS: Record<RoomTheme, () => JSX.Element> = {
  /* 1. ROBOT — Sevimli robot kafa */
  robot: () => (
    <g>
      {/* Antenler */}
      <line x1="-25" y1="-50" x2="-25" y2="-65" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="25" y1="-50" x2="25" y2="-65" stroke={GOLD} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="-25" cy="-67" r="3" fill={GOLD} />
      <circle cx="25" cy="-67" r="3" fill={GOLD} />
      {/* Kafa */}
      <rect x="-45" y="-50" width="90" height="80" rx="14" fill={WHITE} opacity="0.95" />
      {/* Gözler */}
      <circle cx="-18" cy="-15" r="8" fill={GOLD_DARK} />
      <circle cx="18" cy="-15" r="8" fill={GOLD_DARK} />
      <circle cx="-15" cy="-18" r="2.5" fill={WHITE} />
      <circle cx="21" cy="-18" r="2.5" fill={WHITE} />
      {/* Ağız (smile) */}
      <path d="M -12 12 Q 0 22 12 12" fill="none" stroke={GOLD_DARK} strokeWidth="3" strokeLinecap="round" />
      {/* Yan kulaklar */}
      <rect x="-52" y="-25" width="6" height="20" rx="3" fill={GOLD} />
      <rect x="46" y="-25" width="6" height="20" rx="3" fill={GOLD} />
    </g>
  ),

  /* 2. PC — Monitor ve klavye */
  pc: () => (
    <g>
      {/* Monitor */}
      <rect x="-60" y="-50" width="120" height="75" rx="6" fill={WHITE} opacity="0.95" />
      <rect x="-54" y="-44" width="108" height="55" fill="#003721" />
      {/* Ekran içeriği */}
      <rect x="-46" y="-36" width="36" height="4" rx="1" fill={GOLD} />
      <rect x="-46" y="-26" width="60" height="3" rx="1" fill="#6cb685" />
      <rect x="-46" y="-19" width="48" height="3" rx="1" fill="#6cb685" />
      <rect x="-46" y="-12" width="70" height="3" rx="1" fill="#6cb685" opacity="0.7" />
      <rect x="-46" y="-5" width="54" height="3" rx="1" fill="#6cb685" opacity="0.7" />
      {/* AI dot indicator */}
      <circle cx="44" cy="-38" r="3" fill={GOLD} />
      {/* Stand */}
      <rect x="-6" y="25" width="12" height="14" fill={WHITE} opacity="0.7" />
      <rect x="-30" y="38" width="60" height="6" rx="2" fill={WHITE} opacity="0.85" />
    </g>
  ),

  /* 3. NEURAL — Sinir ağı düğümleri */
  neural: () => (
    <g>
      {/* Bağlantılar (connections) */}
      <g stroke={GOLD} strokeWidth="1.3" opacity="0.55">
        <line x1="-60" y1="-40" x2="-15" y2="-30" />
        <line x1="-60" y1="-40" x2="-15" y2="10" />
        <line x1="-60" y1="0" x2="-15" y2="-30" />
        <line x1="-60" y1="0" x2="-15" y2="10" />
        <line x1="-60" y1="40" x2="-15" y2="10" />
        <line x1="-60" y1="40" x2="-15" y2="40" />
        <line x1="-15" y1="-30" x2="30" y2="-15" />
        <line x1="-15" y1="-30" x2="30" y2="20" />
        <line x1="-15" y1="10" x2="30" y2="-15" />
        <line x1="-15" y1="10" x2="30" y2="20" />
        <line x1="-15" y1="40" x2="30" y2="20" />
        <line x1="30" y1="-15" x2="65" y2="0" />
        <line x1="30" y1="20" x2="65" y2="0" />
      </g>
      {/* Düğümler (nodes) */}
      <g>
        {[
          [-60, -40], [-60, 0], [-60, 40],
          [-15, -30], [-15, 10], [-15, 40],
          [30, -15], [30, 20],
          [65, 0],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="6" fill={WHITE} stroke={GOLD} strokeWidth="2" />
        ))}
        {/* Vurgu düğümü */}
        <circle cx="65" cy="0" r="8" fill={GOLD} />
      </g>
    </g>
  ),

  /* 4. CHATBOT — Konuşma balonu + sparkle */
  chatbot: () => (
    <g>
      {/* Sol balon */}
      <rect x="-65" y="-40" width="70" height="40" rx="14" fill={WHITE} opacity="0.95" />
      <polygon points="-50,0 -58,15 -38,0" fill={WHITE} opacity="0.95" />
      <circle cx="-50" cy="-20" r="3" fill={GOLD_DARK} />
      <circle cx="-35" cy="-20" r="3" fill={GOLD_DARK} />
      <circle cx="-20" cy="-20" r="3" fill={GOLD_DARK} />
      {/* Sağ balon */}
      <rect x="-5" y="0" width="70" height="40" rx="14" fill={GOLD} />
      <polygon points="20,40 28,55 48,40" fill={GOLD} />
      <rect x="5" y="14" width="44" height="3" rx="1.5" fill={WHITE} opacity="0.85" />
      <rect x="5" y="22" width="36" height="3" rx="1.5" fill={WHITE} opacity="0.85" />
      {/* Sparkle */}
      <g transform="translate(40 -45)">
        <path d="M 0 -10 L 2 -2 L 10 0 L 2 2 L 0 10 L -2 2 L -10 0 L -2 -2 Z" fill={GOLD} />
      </g>
    </g>
  ),

  /* 5. DATA — Bar chart */
  data: () => (
    <g>
      {/* Eksen */}
      <line x1="-65" y1="40" x2="65" y2="40" stroke={WHITE} strokeWidth="2" opacity="0.6" />
      <line x1="-65" y1="40" x2="-65" y2="-50" stroke={WHITE} strokeWidth="2" opacity="0.6" />
      {/* Barlar */}
      <rect x="-58" y="0" width="16" height="40" rx="2" fill={GOLD} opacity="0.85" />
      <rect x="-36" y="-20" width="16" height="60" rx="2" fill={WHITE} opacity="0.9" />
      <rect x="-14" y="-35" width="16" height="75" rx="2" fill={GOLD} />
      <rect x="8" y="-15" width="16" height="55" rx="2" fill={WHITE} opacity="0.9" />
      <rect x="30" y="-45" width="16" height="85" rx="2" fill={GOLD} />
      {/* Trend çizgisi */}
      <polyline
        points="-50,-5 -28,-25 -6,-40 16,-20 38,-50"
        fill="none"
        stroke={WHITE}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.95"
      />
      {Array.from({ length: 5 }).map((_, i) => {
        const xs = [-50, -28, -6, 16, 38];
        const ys = [-5, -25, -40, -20, -50];
        return <circle key={i} cx={xs[i]} cy={ys[i]} r="3.5" fill={WHITE} stroke={GOLD_DARK} strokeWidth="1.5" />;
      })}
    </g>
  ),

  /* 6. BRAIN — Stilize beyin + devre */
  brain: () => (
    <g>
      {/* Beyin silüeti */}
      <path
        d="M -50 -10 C -50 -40, -25 -50, -10 -45 C -5 -50, 10 -52, 20 -45 C 40 -45, 50 -25, 45 -5 C 55 5, 50 30, 30 35 C 25 45, 5 45, -5 38 C -25 45, -50 30, -45 10 C -55 5, -55 -5, -50 -10 Z"
        fill={WHITE}
        opacity="0.95"
      />
      {/* Devre noktaları */}
      <g fill={GOLD}>
        <circle cx="-30" cy="-20" r="3" />
        <circle cx="-10" cy="-5" r="3" />
        <circle cx="15" cy="-25" r="3" />
        <circle cx="25" cy="10" r="3" />
        <circle cx="-15" cy="20" r="3" />
        <circle cx="5" cy="30" r="3" />
      </g>
      <g stroke={GOLD_DARK} strokeWidth="1.5" fill="none">
        <path d="M -30 -20 L -10 -5 L 15 -25" />
        <path d="M -10 -5 L 25 10 L 5 30" />
        <path d="M 15 -25 L 25 10" />
        <path d="M -15 20 L 5 30" />
        <path d="M -10 -5 L -15 20" />
      </g>
    </g>
  ),

  /* 7. CODE — Köşeli parantezler ve eğik çizgi */
  code: () => (
    <g>
      {/* Sol köşeli parantez < */}
      <path
        d="M -50 -45 L -85 0 L -50 45"
        fill="none"
        stroke={WHITE}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
      {/* Eğik çizgi / */}
      <line x1="-25" y1="45" x2="25" y2="-45" stroke={GOLD} strokeWidth="9" strokeLinecap="round" />
      {/* Sağ köşeli parantez > */}
      <path
        d="M 50 -45 L 85 0 L 50 45"
        fill="none"
        stroke={WHITE}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
      {/* Sparkles */}
      <g fill={GOLD}>
        <circle cx="-70" cy="-50" r="2.5" />
        <circle cx="70" cy="50" r="2.5" />
      </g>
    </g>
  ),

  /* 8. CLOUD — Bulut + veri akışı */
  cloud: () => (
    <g>
      {/* Bulut gövdesi */}
      <path
        d="M -55 -10 C -55 -30, -30 -38, -15 -28 C -10 -45, 20 -45, 25 -25 C 50 -28, 55 0, 35 5 L -45 5 C -60 0, -60 -5, -55 -10 Z"
        fill={WHITE}
        opacity="0.95"
      />
      {/* Veri damlaları */}
      <g fill={GOLD}>
        <rect x="-30" y="20" width="3" height="15" rx="1.5" />
        <rect x="-12" y="25" width="3" height="20" rx="1.5" />
        <rect x="6" y="20" width="3" height="15" rx="1.5" />
        <rect x="22" y="28" width="3" height="22" rx="1.5" />
        <rect x="-46" y="25" width="3" height="18" rx="1.5" />
      </g>
      {/* Üst sparkle */}
      <g fill={GOLD} transform="translate(40 -40)">
        <path d="M 0 -8 L 2 -2 L 8 0 L 2 2 L 0 8 L -2 2 L -8 0 L -2 -2 Z" />
      </g>
    </g>
  ),

  /* 9. VECTOR — Latent space (3D nokta bulutu) */
  vector: () => (
    <g>
      {/* 3D küp çerçevesi (perspektif) */}
      <g stroke={WHITE} strokeWidth="1.5" fill="none" opacity="0.5">
        <polygon points="-50,-30 50,-30 70,-10 -30,-10" />
        <polygon points="-30,-10 70,-10 70,40 -30,40" />
        <line x1="-50" y1="-30" x2="-30" y2="-10" />
        <line x1="-50" y1="-30" x2="-50" y2="20" strokeDasharray="3 3" />
        <line x1="-50" y1="20" x2="-30" y2="40" strokeDasharray="3 3" />
      </g>
      {/* Embedding noktaları */}
      <g>
        {[
          [-20, -5, GOLD, 4],
          [10, 0, WHITE, 3.5],
          [35, 8, GOLD, 5],
          [-10, 22, WHITE, 3],
          [25, 25, GOLD, 4],
          [50, -2, WHITE, 3.5],
          [0, 35, GOLD, 4.5],
          [-25, 32, WHITE, 3],
          [55, 28, GOLD, 4],
          [15, 12, WHITE, 2.5],
        ].map(([x, y, color, r], i) => (
          <circle key={i} cx={x as number} cy={y as number} r={r as number} fill={color as string} />
        ))}
      </g>
      {/* Vurgu çizgisi (en yakın komşu) */}
      <line x1="-20" y1="-5" x2="10" y2="0" stroke={GOLD} strokeWidth="1.5" opacity="0.7" />
      <line x1="10" y1="0" x2="35" y2="8" stroke={GOLD} strokeWidth="1.5" opacity="0.7" />
    </g>
  ),

  /* 10. AGENT — Otomasyon dişlileri + ok */
  agent: () => (
    <g>
      {/* Büyük dişli */}
      <g transform="translate(-25 0)">
        <circle r="32" fill={WHITE} opacity="0.95" />
        <circle r="12" fill="#003721" />
        {/* 8 diş */}
        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i * 360) / 8;
          return (
            <rect
              key={i}
              x="-5"
              y="-40"
              width="10"
              height="10"
              fill={WHITE}
              opacity="0.95"
              transform={`rotate(${angle})`}
            />
          );
        })}
      </g>
      {/* Küçük dişli */}
      <g transform="translate(35 -15)">
        <circle r="20" fill={GOLD} />
        <circle r="7" fill="#003721" />
        {Array.from({ length: 6 }).map((_, i) => {
          const angle = (i * 360) / 6;
          return (
            <rect
              key={i}
              x="-4"
              y="-26"
              width="8"
              height="8"
              fill={GOLD}
              transform={`rotate(${angle})`}
            />
          );
        })}
      </g>
      {/* Otomasyon oku */}
      <path
        d="M 10 30 L 50 30"
        stroke={GOLD}
        strokeWidth="3"
        strokeLinecap="round"
        markerEnd="url(#arrowAgent)"
      />
      <defs>
        <marker id="arrowAgent" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={GOLD} />
        </marker>
      </defs>
    </g>
  ),
};
