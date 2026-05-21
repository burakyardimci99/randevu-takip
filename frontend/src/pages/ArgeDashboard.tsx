/**
 * YZ / Ar-Ge Mühendisi Dashboard — `/arge`
 *
 * RACI: R/A "Stage onayı", "Production onayı", "Rollback kararı".
 * Görev: onaylı projeleri yaşam döngüsünde ileri (advance) ya da geri (regress)
 * götürür; kullanıcıların aşama ilerletme taleplerini onaylar veya reddeder.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell, type NavItem } from '../components/AppShell';
import { ProjectLifecycleBar } from '../components/governance/ProjectLifecycleBar';
import { useToast } from '../components/Toast';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import { api } from '../services/api';
import type { Booking, LifecycleStage } from '../types';

const NAV_ITEMS: NavItem[] = [
  {
    to: '/arge',
    label: 'Projeler',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
      </svg>
    ),
  },
];

const STAGE_ORDER: LifecycleStage[] = [
  'application',
  'development',
  'stage',
  'production',
  'live',
];

const STAGE_META: Record<LifecycleStage, { label: string; cls: string }> = {
  application: { label: 'Başvuru', cls: 'bg-kt-gray-100 text-kt-gray-700 border-kt-gray-300' },
  development: { label: 'Geliştirme', cls: 'bg-cyan-100 text-cyan-800 border-cyan-300' },
  stage: { label: 'Stage', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  production: { label: 'Production', cls: 'bg-violet-100 text-violet-700 border-violet-300' },
  live: { label: 'Canlı', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
};

type Filter = 'all' | LifecycleStage | 'advance_pending';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' });
}
function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export default function ArgeDashboard() {
  const toast = useToast();
  const [projects, setProjects] = useState<Booking[]>([]);
  const [counts, setCounts] = useState({
    total: 0,
    withAdvanceRequest: 0,
    inStage: 0,
    inProduction: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.argeProjects();
      setProjects(res.projects);
      setCounts(res.counts);
    } catch (err) {
      toast.push('error', (err as Error).message || 'Yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeEvents('arge', (type) => {
    if (type.startsWith('booking.')) void load();
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((b) => {
      if (filter === 'advance_pending' && !b.stageAdvanceRequestedAt) return false;
      if (
        filter !== 'all' &&
        filter !== 'advance_pending' &&
        b.lifecycleStage !== filter
      )
        return false;
      if (!q) return true;
      return (
        b.projectName.toLowerCase().includes(q) ||
        (b.userFullName ?? '').toLowerCase().includes(q) ||
        b.roomCode.toLowerCase().includes(q)
      );
    });
  }, [projects, filter, search]);

  async function advance(b: Booking) {
    setSubmitting(b.id);
    try {
      const res = await api.argeAdvanceStage(b.id);
      toast.push(
        'success',
        `${b.projectName} → ${STAGE_META[res.booking.lifecycleStage].label}`
      );
      await load();
    } catch (err) {
      toast.push('error', (err as Error).message || 'Aşama ilerletilemedi.');
    } finally {
      setSubmitting(null);
    }
  }

  async function regress(b: Booking) {
    setSubmitting(b.id);
    try {
      const res = await api.argeRegressStage(b.id);
      toast.push('info', `${b.projectName} ← ${STAGE_META[res.booking.lifecycleStage].label}`);
      await load();
    } catch (err) {
      toast.push('error', (err as Error).message || 'Aşama geri alınamadı.');
    } finally {
      setSubmitting(null);
    }
  }

  async function rejectAdvance(b: Booking) {
    setSubmitting(b.id);
    try {
      await api.argeRejectAdvanceRequest(b.id);
      toast.push('info', 'İlerletme talebi reddedildi.');
      await load();
    } catch (err) {
      toast.push('error', (err as Error).message || 'İşlem başarısız.');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <AppShell
      kind="arge"
      navItems={NAV_ITEMS}
      profileLink="/arge"
      roleLabel="YZ / Ar-Ge Mühendisi"
    >
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 text-violet-200 text-[11px] font-bold uppercase tracking-[0.18em] border border-violet-400/30 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-300" />
            YZ / Ar-Ge Mühendisi
          </div>
          <h1 className="text-3xl font-extrabold text-kt-green-900">
            Proje Yaşam Döngüsü
          </h1>
          <p className="text-kt-gray-500 text-sm mt-1">
            Onaylı projeleri Stage / Production aşamasına ilerletin; gerektiğinde
            geri alın (rollback). Kullanıcıların ilerletme taleplerini siz onaylarsınız.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-200">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Talep
            </div>
            <div className="text-2xl font-extrabold text-amber-800 leading-tight">
              {counts.withAdvanceRequest}
            </div>
          </div>
          <div className="px-4 py-2 rounded-xl bg-blue-50 border border-blue-200">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Stage
            </div>
            <div className="text-2xl font-extrabold text-blue-800 leading-tight">
              {counts.inStage}
            </div>
          </div>
          <div className="px-4 py-2 rounded-xl bg-violet-50 border border-violet-200">
            <div className="text-xs font-bold uppercase tracking-wider text-violet-700">
              Production
            </div>
            <div className="text-2xl font-extrabold text-violet-800 leading-tight">
              {counts.inProduction}
            </div>
          </div>
        </div>
      </div>

      {/* Filter chip'leri */}
      <div className="card p-4 mb-4 flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <div className="flex gap-2 flex-wrap text-sm">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              filter === 'all'
                ? 'bg-kt-green-700 text-white shadow-kt-green'
                : 'bg-kt-gray-100 text-kt-gray-700 hover:bg-kt-gray-200'
            }`}
          >
            Tümü ({counts.total})
          </button>
          <button
            type="button"
            onClick={() =>
              setFilter(filter === 'advance_pending' ? 'all' : 'advance_pending')
            }
            className={`px-3 py-1.5 rounded-lg font-bold transition border bg-amber-100 text-amber-900 border-amber-300 ${
              filter === 'advance_pending'
                ? 'ring-2 ring-offset-1 ring-amber-400'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            ⏰ Talep ({counts.withAdvanceRequest})
          </button>
          {STAGE_ORDER.filter((s) => s !== 'application').map((s) => {
            const meta = STAGE_META[s];
            const count = projects.filter((b) => b.lifecycleStage === s).length;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(filter === s ? 'all' : s)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition border ${
                  filter === s
                    ? meta.cls + ' ring-2 ring-offset-1 ring-kt-gold-400'
                    : meta.cls + ' opacity-70 hover:opacity-100'
                }`}
              >
                {meta.label} ({count})
              </button>
            );
          })}
        </div>
        <input
          type="search"
          className="input md:max-w-xs"
          placeholder="Proje / kullanıcı / oda ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={80}
        />
      </div>

      {loading ? (
        <div className="card p-10 text-center text-kt-gray-500">Yükleniyor…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-kt-gray-500">
          Eşleşen proje yok.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((b) => {
            const idx = STAGE_ORDER.indexOf(b.lifecycleStage);
            const isTerminal = idx >= STAGE_ORDER.length - 1;
            const isAtStart = idx <= 1;
            const next = !isTerminal ? STAGE_ORDER[idx + 1] : null;
            const prev = !isAtStart ? STAGE_ORDER[idx - 1] : null;
            const meta = STAGE_META[b.lifecycleStage];
            const pending = !!b.stageAdvanceRequestedAt;
            const busy = submitting === b.id;

            return (
              <article
                key={b.id}
                className={`card p-5 ${pending ? 'ring-2 ring-amber-300' : ''}`}
              >
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono text-xs font-bold text-kt-gold-700 tracking-wider">
                        {b.roomCode}
                      </span>
                      <span className="text-kt-gray-300">·</span>
                      <span className="text-xs text-kt-gray-500 truncate">
                        {b.userFullName ?? b.userEmail}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-kt-green-900 truncate">
                      {b.projectName}
                    </h3>
                    <div className="text-xs text-kt-gray-500 mt-0.5">
                      {fmtDate(b.startDate)} – {fmtDate(b.endDate)}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2 py-1 rounded-md border shrink-0 ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                </div>

                <div className="my-3">
                  <ProjectLifecycleBar stage={b.lifecycleStage} />
                </div>

                {pending && (
                  <div className="mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs">
                    <div className="font-bold mb-0.5">
                      Kullanıcı aşama ilerletme talebi gönderdi
                    </div>
                    <div className="opacity-90 text-[11px]">
                      {new Date(b.stageAdvanceRequestedAt!).toLocaleString('tr-TR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {b.stageAdvanceNote && (
                        <div className="italic mt-1">"{b.stageAdvanceNote}"</div>
                      )}
                    </div>
                    <div className="flex justify-end gap-1.5 mt-2">
                      <button
                        type="button"
                        onClick={() => rejectAdvance(b)}
                        disabled={busy}
                        className="text-[11px] font-semibold px-2 py-1 rounded bg-white text-rose-700 border border-rose-300 hover:bg-rose-50"
                      >
                        Reddet
                      </button>
                      {next && (
                        <button
                          type="button"
                          onClick={() => advance(b)}
                          disabled={busy}
                          className="text-[11px] font-semibold px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          ✓ Onayla → {STAGE_META[next].label}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 text-xs text-kt-gray-500">
                  <span>
                    {meta.label}'da{' '}
                    <strong className="text-kt-green-800">
                      {daysSince(b.stageEnteredAt)} gün
                    </strong>
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {prev && (
                      <button
                        type="button"
                        onClick={() => regress(b)}
                        disabled={busy}
                        className="text-xs font-semibold px-2 py-1.5 rounded-md text-kt-gray-700 hover:bg-kt-gray-100 border border-kt-gray-200"
                        title={`${STAGE_META[prev].label} aşamasına geri al`}
                      >
                        ← {STAGE_META[prev].label}
                      </button>
                    )}
                    {next ? (
                      <button
                        type="button"
                        onClick={() => advance(b)}
                        disabled={busy}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md bg-kt-green-700 text-white hover:bg-kt-green-800"
                      >
                        → {STAGE_META[next].label}
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold text-emerald-700">
                        ● Canlıda
                      </span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
