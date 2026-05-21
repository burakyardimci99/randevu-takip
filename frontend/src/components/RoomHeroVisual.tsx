/**
 * AILAB oda kart başlığı için modern AI / donanım temalı görsel.
 *
 *  - NVIDIA DGX SPARK pod'ları → GPU chip ışıltısı + neural mesh
 *  - MAC STUDIO pod'ları → Mac Studio silüeti + minimalist studio vibe
 *  - AI Deneyim Alanı → workshop / topluluk sahnesi (ekran + figürler)
 *
 * Pod numarasından deterministic bir hue ofseti çıkararak her odanın görsel
 * varyasyonunu sağlıyoruz (aynı tip cihaz olsa bile her kart "kendi rengini"
 * koruyor).
 */
import type { Room } from '../types';

interface Props {
  room: Room;
  className?: string;
}

type Variant = 'nvidia' | 'mac' | 'workshop';

function variantFromEquipment(equipment: string): Variant {
  const eq = equipment.toLowerCase();
  if (eq.includes('nvidia') || eq.includes('dgx')) return 'nvidia';
  if (eq.includes('mac')) return 'mac';
  return 'workshop'; // AI Deneyim Alanı + fallback
}

/** Oda kodundan deterministik 0..1 değeri (renk varyasyonu için). */
function seedFromRoom(room: Room): number {
  let hash = 0;
  for (let i = 0; i < room.code.length; i++) hash = (hash * 31 + room.code.charCodeAt(i)) | 0;
  return ((hash % 100) + 100) / 200; // [0, 1]
}

const PALETTE_NVIDIA = [
  { from: '#064E3B', to: '#10B981', accent: '#6EE7B7' }, // emerald (NVIDIA brand vibe)
  { from: '#022C22', to: '#059669', accent: '#34D399' },
  { from: '#064E3B', to: '#0EA5E9', accent: '#67E8F9' }, // emerald → cyan
];

const PALETTE_MAC = [
  { from: '#1E293B', to: '#475569', accent: '#CBD5E1' }, // slate / silver
  { from: '#1F2937', to: '#6B7280', accent: '#E5E7EB' },
  { from: '#0F172A', to: '#7C3AED', accent: '#C4B5FD' }, // dark + violet (Studio purple)
];

const PALETTE_WORKSHOP = [
  { from: '#3730A3', to: '#A855F7', accent: '#F0ABFC' }, // indigo → purple (eğitim)
];

function pickPalette(variant: Variant, seed: number) {
  if (variant === 'nvidia') return PALETTE_NVIDIA[Math.floor(seed * PALETTE_NVIDIA.length)];
  if (variant === 'mac') return PALETTE_MAC[Math.floor(seed * PALETTE_MAC.length)];
  return PALETTE_WORKSHOP[0];
}

export function RoomHeroVisual({ room, className = '' }: Props) {
  const variant = variantFromEquipment(room.equipment);
  const seed = seedFromRoom(room);
  const palette = pickPalette(variant, seed);
  const uid = room.id.slice(0, 6);

  return (
    <svg
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.from} />
          <stop offset="100%" stopColor={palette.to} />
        </linearGradient>
        <radialGradient id={`glow-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={palette.accent} stopOpacity="0.55" />
          <stop offset="100%" stopColor={palette.accent} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`spot-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Zemin */}
      <rect width="400" height="200" fill={`url(#bg-${uid})`} />

      {/* Atmosferik orb'lar */}
      <circle cx={70 + seed * 80} cy={40 + seed * 30} r="120" fill={`url(#glow-${uid})`} />
      <circle cx={320 - seed * 60} cy="160" r="100" fill={`url(#glow-${uid})`} opacity="0.6" />
      <circle cx={200} cy={100} r="160" fill={`url(#spot-${uid})`} />

      {/* Circuit grid — incelikli, donanım vibe */}
      <g opacity="0.10" stroke={palette.accent} strokeWidth="0.4" fill="none">
        {Array.from({ length: 11 }).map((_, i) => (
          <line key={`v-${i}`} x1={i * 40} y1="0" x2={i * 40} y2="200" />
        ))}
        {Array.from({ length: 6 }).map((_, i) => (
          <line key={`h-${i}`} x1="0" y1={i * 40} x2="400" y2={i * 40} />
        ))}
      </g>

      {variant === 'nvidia' && <NvidiaArt palette={palette} dual={room.capacity > 1} />}
      {variant === 'mac' && <MacArt palette={palette} dual={room.capacity > 1} />}
      {variant === 'workshop' && <WorkshopArt palette={palette} />}
    </svg>
  );
}

/* ============================================================
 * NVIDIA — GPU chip + neural mesh
 * ============================================================ */
function NvidiaArt({ palette, dual }: { palette: { accent: string }; dual: boolean }) {
  const { accent } = palette;
  return (
    <g transform="translate(200 100)">
      {/* Neural mesh — sol */}
      <g stroke={accent} strokeWidth="1" opacity="0.6">
        <line x1="-150" y1="-50" x2="-90" y2="-30" />
        <line x1="-150" y1="-10" x2="-90" y2="-30" />
        <line x1="-150" y1="-10" x2="-90" y2="20" />
        <line x1="-150" y1="40" x2="-90" y2="20" />
        <line x1="-90" y1="-30" x2="-50" y2="0" />
        <line x1="-90" y1="20" x2="-50" y2="0" />
      </g>
      {[
        [-150, -50],
        [-150, -10],
        [-150, 40],
        [-90, -30],
        [-90, 20],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={accent} />
      ))}

      {/* GPU chip(s) */}
      {(dual ? [-50, 50] : [0]).map((cx, idx) => (
        <g key={idx} transform={`translate(${cx} 0)`}>
          {/* Chip body */}
          <rect x="-40" y="-32" width="80" height="64" rx="6" fill="#0B1220" stroke={accent} strokeWidth="2" />
          {/* Inner die */}
          <rect x="-26" y="-20" width="52" height="40" rx="3" fill="#1F2937" stroke={accent} strokeWidth="1.2" opacity="0.9" />
          {/* CUDA core grid */}
          <g fill={accent} opacity="0.85">
            {Array.from({ length: 4 }).map((_, r) =>
              Array.from({ length: 6 }).map((_, c) => (
                <rect
                  key={`${r}-${c}`}
                  x={-22 + c * 7.5}
                  y={-16 + r * 9}
                  width="5"
                  height="6"
                  rx="0.5"
                />
              ))
            )}
          </g>
          {/* Pins */}
          {Array.from({ length: 7 }).map((_, i) => (
            <line
              key={`top-${i}`}
              x1={-30 + i * 10}
              y1="-32"
              x2={-30 + i * 10}
              y2="-40"
              stroke={accent}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          ))}
          {Array.from({ length: 7 }).map((_, i) => (
            <line
              key={`bot-${i}`}
              x1={-30 + i * 10}
              y1="32"
              x2={-30 + i * 10}
              y2="40"
              stroke={accent}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          ))}
        </g>
      ))}

      {/* Top label — "GPU" tag */}
      <text
        x={dual ? -50 : 0}
        y={-46}
        textAnchor="middle"
        fill={accent}
        fontSize="9"
        fontWeight="bold"
        fontFamily="monospace"
        letterSpacing="2"
      >
        DGX SPARK
      </text>

      {/* Power glow */}
      <circle cx="60" cy="-30" r="2.5" fill={accent}>
        <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

/* ============================================================
 * MAC STUDIO — minimal silüet
 * ============================================================ */
function MacArt({ palette, dual }: { palette: { accent: string }; dual: boolean }) {
  const { accent } = palette;
  return (
    <g transform="translate(200 100)">
      {(dual ? [-60, 60] : [0]).map((cx, idx) => (
        <g key={idx} transform={`translate(${cx} 0)`}>
          {/* Mac Studio body (square box) */}
          <rect
            x="-44"
            y="-22"
            width="88"
            height="44"
            rx="6"
            fill="#F1F5F9"
            stroke={accent}
            strokeWidth="1.5"
          />
          {/* Top ventilation pattern */}
          <g fill={accent} opacity="0.35">
            {Array.from({ length: 7 }).map((_, i) => (
              <circle key={i} cx={-30 + i * 10} cy="-15" r="1.5" />
            ))}
          </g>
          {/* Apple-like central spot */}
          <circle cx="0" cy="0" r="5" fill={accent} opacity="0.9" />
          <circle cx="0" cy="0" r="3" fill="#F1F5F9" />
          {/* Side ports */}
          <rect x="-40" y="14" width="14" height="3" rx="0.5" fill={accent} opacity="0.5" />
          <rect x="-22" y="14" width="14" height="3" rx="0.5" fill={accent} opacity="0.5" />
          <rect x="-4" y="14" width="14" height="3" rx="0.5" fill={accent} opacity="0.5" />
          <rect x="14" y="14" width="14" height="3" rx="0.5" fill={accent} opacity="0.5" />
          {/* Base shadow */}
          <ellipse cx="0" cy="30" rx="48" ry="4" fill="#000" opacity="0.25" />
        </g>
      ))}

      {/* Floating monitor outline above */}
      <g opacity="0.55">
        <rect
          x={dual ? -110 : -55}
          y="-72"
          width={dual ? 220 : 110}
          height="40"
          rx="3"
          fill="none"
          stroke={accent}
          strokeWidth="1.2"
        />
        <line
          x1={dual ? -28 : 0}
          y1="-32"
          x2={dual ? -28 : 0}
          y2="-24"
          stroke={accent}
          strokeWidth="1.2"
        />
        <ellipse cx={dual ? -28 : 0} cy="-22" rx="20" ry="2" fill="none" stroke={accent} strokeWidth="1" />
      </g>

      <text
        x={dual ? 60 : 0}
        y="40"
        textAnchor="middle"
        fill={accent}
        fontSize="9"
        fontWeight="bold"
        fontFamily="monospace"
        letterSpacing="2"
      >
        MAC STUDIO
      </text>
    </g>
  );
}

/* ============================================================
 * AI DENEYİM ALANI — workshop sahnesi
 * ============================================================ */
function WorkshopArt({ palette }: { palette: { accent: string } }) {
  const { accent } = palette;
  return (
    <g transform="translate(200 100)">
      {/* Büyük ekran */}
      <rect x="-110" y="-65" width="220" height="80" rx="6" fill="#0F172A" stroke={accent} strokeWidth="2" />
      {/* Ekran içeriği — neural mesh */}
      <g stroke={accent} strokeWidth="1" opacity="0.7">
        <line x1="-90" y1="-45" x2="-50" y2="-30" />
        <line x1="-90" y1="-25" x2="-50" y2="-30" />
        <line x1="-90" y1="-25" x2="-50" y2="-5" />
        <line x1="-50" y1="-30" x2="-10" y2="-15" />
        <line x1="-50" y1="-5" x2="-10" y2="-15" />
        <line x1="-50" y1="-5" x2="-10" y2="10" />
        <line x1="-10" y1="-15" x2="30" y2="-10" />
        <line x1="-10" y1="10" x2="30" y2="-10" />
        <line x1="30" y1="-10" x2="70" y2="-20" />
        <line x1="30" y1="-10" x2="70" y2="5" />
      </g>
      {[
        [-90, -45],
        [-90, -25],
        [-50, -30],
        [-50, -5],
        [-10, -15],
        [-10, 10],
        [30, -10],
        [70, -20],
        [70, 5],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill={accent} />
      ))}
      <circle cx="70" cy="5" r="5" fill={accent} />

      {/* Yer/masa zemini */}
      <rect x="-130" y="22" width="260" height="2" fill={accent} opacity="0.4" />

      {/* Katılımcı figürleri — silüet */}
      {[-95, -55, -15, 25, 65].map((x, i) => (
        <g key={i} transform={`translate(${x} 50)`}>
          {/* Kafa */}
          <circle cx="0" cy="-26" r="5" fill={accent} opacity="0.85" />
          {/* Gövde */}
          <path
            d="M -8 -20 Q 0 -22 8 -20 L 6 -2 L -6 -2 Z"
            fill={accent}
            opacity="0.7"
          />
        </g>
      ))}

      <text
        x="0"
        y="74"
        textAnchor="middle"
        fill={accent}
        fontSize="9"
        fontWeight="bold"
        fontFamily="monospace"
        letterSpacing="2"
      >
        AI DENEYİM ALANI
      </text>
    </g>
  );
}
