/**
 * EmptyState — kullanıcı dostu boş durum component'i.
 *
 * Kullanım:
 *  <EmptyState icon="rooms" title="..." description="..." action={...} />
 *
 * 6 hazır illustration var, hepsi inline SVG (network çağırmaz).
 */
import type { ReactNode } from 'react';

export type EmptyStateIcon =
  | 'rooms'        // oda / building
  | 'bookings'     // belge / dosya
  | 'waitlist'     // saat
  | 'showcase'     // resim galeri
  | 'users'        // ekip
  | 'audit'        // arşiv kutu
  | 'message'      // konuşma balonu
  | 'search'       // bulunamadı
  | 'star'         // beğeni / favori
  | 'data';        // chart

interface Props {
  icon?: EmptyStateIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Tema: 'cyan' (default), 'gold', 'rose'. */
  tone?: 'cyan' | 'gold' | 'rose' | 'violet';
}

export function EmptyState({
  icon = 'search',
  title,
  description,
  action,
  tone = 'cyan',
}: Props) {
  const toneCls =
    tone === 'gold'
      ? { iconBg: 'from-kt-gold-100 to-kt-gold-50', iconColor: 'text-kt-gold-600', ring: 'ring-kt-gold-200/60' }
      : tone === 'rose'
      ? { iconBg: 'from-rose-100 to-rose-50', iconColor: 'text-rose-600', ring: 'ring-rose-200/60' }
      : tone === 'violet'
      ? { iconBg: 'from-kt-violet-100 to-purple-50', iconColor: 'text-kt-violet-600', ring: 'ring-kt-violet-300/60' }
      : { iconBg: 'from-kt-gold-100 to-cyan-50', iconColor: 'text-kt-gold-600', ring: 'ring-kt-gold-300/60' };

  return (
    <div className="card p-12 text-center relative overflow-hidden">
      {/* AI vibe — soft gradient orbs */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-kt-gold-400/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-kt-violet-500/8 rounded-full blur-3xl pointer-events-none" />

      <div
        className={`relative w-24 h-24 mx-auto mb-5 rounded-3xl bg-gradient-to-br ${toneCls.iconBg} ${toneCls.iconColor} flex items-center justify-center ring-4 ${toneCls.ring} ring-offset-2 ring-offset-white shadow-kt-soft`}
      >
        <IconRender icon={icon} />
      </div>

      <h3 className="text-xl font-extrabold text-kt-green-900 mb-2 relative">{title}</h3>
      {description && (
        <p className="text-sm text-kt-gray-500 max-w-md mx-auto leading-relaxed mb-5 relative">
          {description}
        </p>
      )}
      {action && <div className="relative inline-block">{action}</div>}
    </div>
  );
}

function IconRender({ icon }: { icon: EmptyStateIcon }) {
  const common = { className: 'w-12 h-12', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', viewBox: '0 0 24 24' };
  switch (icon) {
    case 'rooms':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'bookings':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 14h6m-6-4h6m-6 8h3" />
        </svg>
      );
    case 'waitlist':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'showcase':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'audit':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
      );
    case 'message':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      );
    case 'data':
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      );
  }
}
