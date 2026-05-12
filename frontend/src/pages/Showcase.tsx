/**
 * Vibe coding showcase — onaylanan projelerin public galerisi.
 *
 * Erişim:
 * - Giriş yapılmadan da erişilebilir (auth gerektirmez).
 * - User'ın kendi onaylı booking'i için Profilim'de "Galeride göster" toggle var.
 *
 * Görsel:
 * - Highlight'lar üstte (admin etiketler), filter chip'leri ile teknoloji filtre.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import type { ShowcaseItem } from '../types';

function fmtRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  return `${new Date(start).toLocaleDateString('tr-TR', opts)} → ${new Date(end).toLocaleDateString('tr-TR', opts)}`;
}

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export default function Showcase() {
  const { user, admin } = useAuth();
  const [items, setItems] = useState<ShowcaseItem[]>([]);
  const [techs, setTechs] = useState<Array<{ technology: string; count: number }>>([]);
  const [activeTech, setActiveTech] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t] = await Promise.all([api.showcase(), api.showcaseTechnologies()]);
      setItems(s.items);
      setTechs(t.technologies);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (activeTech && !it.technologies.includes(activeTech)) return false;
      if (!q) return true;
      return (
        it.projectName.toLowerCase().includes(q) ||
        it.projectDescription.toLowerCase().includes(q) ||
        it.authorFullName.toLowerCase().includes(q) ||
        it.technologies.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [items, query, activeTech]);

  const isLoggedIn = !!user || !!admin;
  const homeLink = admin ? '/admin' : user ? '/rooms' : '/';

  return (
    <div className="min-h-screen flex flex-col bg-kt-gray-50">
      {/* Public minimal header */}
      <header className="bg-white border-b border-kt-gray-100 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to={homeLink} className="shrink-0">
            <Logo size="sm" />
          </Link>
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Link to={homeLink} className="btn-ghost text-sm">
                Panele dön →
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-ghost text-sm">
                  Giriş Yap
                </Link>
                <Link to="/register" className="btn-primary text-sm">
                  Kayıt Ol
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10">
        {/* Hero */}
        <section className="mb-10">
          <div className="text-xs uppercase tracking-widest text-kt-gold-700 font-bold mb-2">
            Vibe Coding Galerisi
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-kt-green-900 mb-3">
            AI Lab'da yapılan projeler
          </h1>
          <p className="text-kt-gray-600 max-w-2xl leading-relaxed">
            Kuveyt Türk AI Lab odalarında ekiplerimizin geliştirdiği projeler. Fikir
            arıyorsanız, benzer projeler yapan ekiplerle bağlantı kurmak istiyorsanız — buradan başlayın.
          </p>
        </section>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-kt-gray-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              className="input pl-11"
              placeholder="Proje, ekip üyesi veya teknoloji ara..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={80}
            />
          </div>
          {activeTech && (
            <button
              onClick={() => setActiveTech(null)}
              className="px-4 py-2.5 rounded-xl bg-kt-gold-100 text-kt-gold-800 font-semibold text-sm border border-kt-gold-200 hover:bg-kt-gold-200 transition-colors flex items-center gap-2"
            >
              {activeTech}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Tag cloud */}
        {techs.length > 0 && !activeTech && (
          <div className="mb-6 flex flex-wrap gap-1.5">
            {techs.slice(0, 16).map((t) => (
              <button
                key={t.technology}
                onClick={() => setActiveTech(t.technology)}
                className="px-2.5 py-1 rounded-md bg-white border border-kt-gray-200 text-xs font-semibold text-kt-green-800 hover:bg-kt-green-50 hover:border-kt-green-300 transition-colors"
              >
                {t.technology}
                <span className="ml-1.5 text-kt-gold-700 font-bold">{t.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Items */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-5 animate-pulse h-48" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-5xl mb-4">🎨</div>
            <h3 className="text-xl font-bold text-kt-green-800 mb-2">
              {items.length === 0 ? 'Henüz galeri boş' : 'Eşleşen proje yok'}
            </h3>
            <p className="text-kt-gray-500">
              {items.length === 0
                ? 'Onaylanan ilk projeler burada gösterilecek.'
                : 'Filtreleri değiştirip tekrar deneyin.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <article
                key={item.id}
                className={`card-hover p-5 flex flex-col h-full ${
                  item.isHighlight ? 'ring-2 ring-kt-gold-400' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-kt-gold-700 tracking-wider">
                    {item.roomCode} · {item.neighborhood}
                  </span>
                  {item.isHighlight && (
                    <span className="px-2 py-0.5 rounded-md bg-kt-gold-100 text-kt-gold-800 text-[10px] font-bold uppercase tracking-wider">
                      ⭐ Öne çıkan
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-kt-green-900 mb-2 line-clamp-2">
                  {item.projectName}
                </h3>
                <p className="text-sm text-kt-gray-600 line-clamp-3 mb-3 flex-1">
                  {item.projectDescription}
                </p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {item.technologies.slice(0, 5).map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-md bg-kt-green-50 text-kt-green-800 text-[11px] font-semibold"
                    >
                      {t}
                    </span>
                  ))}
                  {item.technologies.length > 5 && (
                    <span className="px-2 py-0.5 rounded-md text-kt-gray-400 text-[11px]">
                      +{item.technologies.length - 5}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-3 border-t border-kt-gray-100">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-kt-green-600 to-kt-green-800 text-white flex items-center justify-center font-bold text-xs">
                    {initials(item.authorFullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-kt-green-800 truncate">
                      {item.authorFullName}
                    </div>
                    <div className="text-[10px] text-kt-gray-500">
                      {fmtRange(item.startDate, item.endDate)} · {item.periodMonths} ay
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-kt-gray-100 bg-white py-4 text-center text-xs text-kt-gray-400">
        Kuveyt Türk AI Lab · Demo · {items.length} proje galeride
      </footer>
    </div>
  );
}
