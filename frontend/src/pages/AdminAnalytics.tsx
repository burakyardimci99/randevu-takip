/**
 * Admin Analytics dashboard.
 *
 * Veri: GET /api/admin/analytics (server tarafı SQL agregasyon).
 * Real-time: booking.* event'lerinde otomatik refresh.
 * Grafikler: AnalyticsCharts.tsx (saf SVG, dependency yok).
 */
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import {
  DailyBookingsChart,
  RoomUsageChart,
  StatusDonut,
  TopTechnologies,
} from '../components/AnalyticsCharts';
import { useToast } from '../components/Toast';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import { api } from '../services/api';
import type { AnalyticsResponse } from '../types';

export default function AdminAnalytics() {
  const toast = useToast();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await api.adminAnalytics();
        setData(res);
      } catch (err) {
        toast.push('error', (err as Error).message || 'Analitik yüklenemedi.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Real-time: booking değişimlerinde sessizce yenile
  useRealtimeEvents('admin', (type) => {
    if (
      type === 'booking.created' ||
      type === 'booking.reviewed' ||
      type === 'booking.withdrawn' ||
      type === 'waitlist.changed'
    ) {
      load(true);
    }
  });

  return (
    <AppShell kind="admin">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-kt-green-900 mb-1">Analiz Paneli</h1>
          <p className="text-kt-gray-500 text-sm">
            Son 30 günün özet metrikleri · otomatik gerçek zamanlı güncelleme
          </p>
        </div>
        <button
          onClick={() => load()}
          className="btn-secondary text-sm flex items-center gap-2"
          disabled={loading || refreshing}
        >
          <svg
            className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? 'Yenileniyor…' : 'Yenile'}
        </button>
      </div>

      {loading || !data ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-6 animate-pulse h-64" />
          ))}
        </div>
      ) : (
        <>
          {/* Top stat row */}
          <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            {[
              { label: 'Toplam talep', value: data.totals.bookings, color: 'text-kt-green-800' },
              { label: 'Aktif kullanıcı', value: data.totals.users, color: 'text-kt-green-700' },
              { label: 'Onaylanan', value: data.totals.approved, color: 'text-emerald-700' },
              { label: 'Bekleyen', value: data.totals.pending, color: 'text-amber-700' },
              { label: 'Düzeltme', value: data.totals.feedbackRequested, color: 'text-blue-700' },
              { label: 'Reddedilen', value: data.totals.rejected, color: 'text-rose-700' },
              { label: 'Sırada', value: data.totals.activeWaitlist, color: 'text-kt-gold-700' },
            ].map((s) => (
              <div key={s.label} className="card p-4">
                <div className={`text-2xl font-extrabold tabular-nums ${s.color}`}>{s.value}</div>
                <div className="text-[11px] uppercase tracking-wider text-kt-gray-500 font-semibold mt-0.5">
                  {s.label}
                </div>
              </div>
            ))}
          </section>

          {/* Grids */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <section className="card p-5 lg:col-span-2">
              <DailyBookingsChart data={data.dailyBookings} />
            </section>
            <section className="card p-5">
              <StatusDonut data={data.statusBreakdown} />
            </section>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <section className="card p-5">
              <RoomUsageChart data={data.roomUsage} />
            </section>
            <section className="card p-5">
              <TopTechnologies data={data.topTechnologies} />
            </section>
          </div>

          {/* Top users */}
          <section className="card p-5">
            <h4 className="text-sm font-bold text-kt-green-900 mb-3">En aktif kullanıcılar</h4>
            {data.topUsers.length === 0 ? (
              <p className="text-sm text-kt-gray-500 italic">Henüz kullanıcı aktivitesi yok.</p>
            ) : (
              <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {data.topUsers.map((u, i) => (
                  <li key={u.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-kt-gray-50">
                    <span className="w-6 h-6 rounded-full bg-kt-gold-100 text-kt-gold-700 flex items-center justify-center text-[11px] font-bold">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-kt-green-900 truncate">
                        {u.fullName}
                      </div>
                      <div className="text-[11px] text-kt-gray-500">{u.email}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-kt-green-800 tabular-nums">
                        {u.bookingCount}
                      </div>
                      <div className="text-[10px] text-emerald-700">
                        {u.approvedCount} onaylı
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="text-xs text-kt-gray-400 text-right mt-4">
            Son güncelleme: {new Date(data.generatedAt).toLocaleString('tr-TR')}
          </div>
        </>
      )}
    </AppShell>
  );
}
