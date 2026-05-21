import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './Toast';
import { NotificationCenter } from './NotificationCenter';
import { CommandPalette } from './CommandPalette';
import { OnboardingTour } from './OnboardingTour';
import type { SubjectKind } from '../types';

interface AppShellProps {
  kind: SubjectKind;
  children: ReactNode;
  /** Ek nav öğeleri (örn. sayfa-spesifik linkler). Sabit nav listesinin yanına eklenir. */
  nav?: ReactNode;
  /**
   * Varsayılan user/admin nav listesini override eder. Yönetişim rolleri için
   * (analitik_danisman, yz_arge) bu prop ile özel nav geçirilir.
   */
  navItems?: NavItem[];
  /** Override profil "to" — örn. yönetişim dashboard'una geri dönüş için. */
  profileLink?: string;
  /** Profil chip altında gösterilecek rol etiketi (admin yerine "Danışman" gibi). */
  roleLabel?: string;
}

export interface NavItem {
  to: string;
  label: string;
  icon: JSX.Element;
}

const USER_NAV: NavItem[] = [
  {
    to: '/rooms',
    label: 'Odalar',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
      </svg>
    ),
  },
  {
    to: '/bookings',
    label: 'Taleplerim',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
      </svg>
    ),
  },
  {
    to: '/takvim',
    label: 'Takvim',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>
    ),
  },
  {
    to: '/waitlist',
    label: 'Sıramda',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    ),
  },
  {
    to: '/showcase',
    label: 'Envanter',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>
    ),
  },
  {
    to: '/licenses',
    label: 'Lisanslarım',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
      </svg>
    ),
  },
  {
    to: '/yardim',
    label: 'Yardım',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'Profilim',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
      </svg>
    ),
  },
];

const ADMIN_NAV: NavItem[] = [
  {
    to: '/admin',
    label: 'Talepler',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
    ),
  },
  {
    to: '/admin/calendar',
    label: 'Takvim',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>
    ),
  },
  {
    to: '/admin/rooms',
    label: 'Odalar',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
      </svg>
    ),
  },
  {
    to: '/admin/analytics',
    label: 'Analiz',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
      </svg>
    ),
  },
  {
    to: '/admin/waitlist',
    label: 'Bekleme',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
    ),
  },
  {
    to: '/admin/users',
    label: 'Kullanıcılar',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
      </svg>
    ),
  },
  {
    to: '/admin/projects',
    label: 'Projeler',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
      </svg>
    ),
  },
  {
    to: '/admin/licenses',
    label: 'Lisanslar',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
      </svg>
    ),
  },
  {
    to: '/admin/audit',
    label: 'Audit',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
      </svg>
    ),
  },
  {
    to: '/admin/security',
    label: 'Güvenlik',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
      </svg>
    ),
  },
];

export function AppShell({
  kind,
  children,
  nav,
  navItems,
  profileLink,
  roleLabel,
}: AppShellProps) {
  const auth = useAuth();
  const { logout } = auth;
  const toast = useToast();
  const navigate = useNavigate();
  const me =
    kind === 'admin'
      ? auth.admin
      : kind === 'danisman'
        ? auth.danisman
        : kind === 'arge'
          ? auth.arge
          : auth.user;
  const items =
    navItems ?? (kind === 'admin' ? ADMIN_NAV : USER_NAV);
  const effectiveProfileLink =
    profileLink ??
    (kind === 'admin'
      ? '/admin'
      : kind === 'danisman'
        ? '/danisman'
        : kind === 'arge'
          ? '/arge'
          : '/profile');
  const effectiveRoleLabel =
    roleLabel ??
    (kind === 'admin'
      ? 'Yönetici'
      : kind === 'danisman'
        ? 'Analitik Danışman'
        : kind === 'arge'
          ? 'YZ / Ar-Ge'
          : 'Kullanıcı');

  async function handleLogout() {
    try {
      await logout(kind);
      toast.push('info', 'Çıkış yapıldı.');
      navigate('/login', { replace: true });
    } catch {
      toast.push('error', 'Çıkış sırasında bir sorun oluştu.');
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-ai-light relative">
      <header className="bg-gradient-to-r from-kt-green-950 via-kt-green-900 to-kt-green-950 border-b border-kt-gold-400/20 sticky top-0 z-40 shadow-glow-blue">
        {/* AI neural overlay */}
        <div className="absolute inset-0 bg-neural-grid-dark opacity-30 pointer-events-none" />
        <div className="absolute -top-10 left-1/4 w-72 h-32 bg-kt-gold-400/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <Link to={items[0].to} className="shrink-0">
            <Logo size="sm" />
          </Link>

          {/* Primary nav (sabit) — 9 admin sekmesi 1280+'ta sığar; altında mobile nav. */}
          <nav className="hidden xl:flex items-center gap-1 flex-1 justify-center">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/admin' || item.to === '/rooms'}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 transition-all ${
                    isActive
                      ? 'bg-kt-gold-400/15 text-kt-gold-300 ring-1 ring-kt-gold-400/40 shadow-glow-cyan'
                      : 'text-white/70 hover:text-kt-gold-300 hover:bg-white/5'
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            {nav}
            <button
              onClick={() => {
                const evt = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
                window.dispatchEvent(evt);
              }}
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-kt-gold-300 text-xs transition-all"
              title="Komut paleti (⌘K)"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Ara</span>
              <kbd className="text-[10px] bg-white/10 px-1 py-0.5 rounded">⌘K</kbd>
            </button>
            <NotificationCenter kind={kind} />
            <Link
              to={effectiveProfileLink}
              className="hidden 2xl:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-kt-gold-400/30 transition-all"
              title={effectiveRoleLabel}
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-kt-gold-400 to-kt-gold-600 text-kt-green-950 flex items-center justify-center font-bold text-xs shadow-glow-cyan">
                {me?.fullName?.split(' ').map((p) => p[0]).slice(0, 2).join('') ?? '??'}
              </div>
              <div className="text-xs">
                <div className="font-semibold text-white leading-tight">{me?.fullName}</div>
                <div className="text-kt-gold-300/80 leading-tight">
                  {effectiveRoleLabel}
                </div>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white/70 hover:text-white hover:bg-rose-500/20 transition-colors"
            >
              Çıkış
            </button>
          </div>
        </div>

        {/* Mobile + dar masaüstü nav (xl altında) */}
        <nav className="xl:hidden border-t border-kt-gold-400/15 px-6 py-2 flex items-center gap-1 overflow-x-auto scrollbar-thin relative">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin' || item.to === '/rooms'}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-kt-gold-400/15 text-kt-gold-300 ring-1 ring-kt-gold-400/40'
                    : 'text-white/60 hover:text-kt-gold-300'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-6 py-8 animate-fade-in">
        {children}
      </main>

      <footer className="relative z-10 border-t border-kt-gray-200 bg-gradient-to-r from-kt-green-950 to-kt-green-900 py-4 text-center text-xs text-white/50">
        <span className="text-kt-gold-400 font-semibold">Kuveyt Türk</span>
        <span className="mx-2 text-kt-gold-400/40">·</span>
        Yapay Zeka Laboratuvarı
        <span className="mx-2 text-kt-gold-400/40">·</span>
        Demo Ortam
      </footer>

      {/* Global overlays */}
      <CommandPalette kind={kind} />
      <OnboardingTour kind={kind} />
    </div>
  );
}
