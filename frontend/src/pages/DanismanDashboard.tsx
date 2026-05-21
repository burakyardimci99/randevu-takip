/**
 * Analitik Danışman Dashboard — `/danisman`
 *
 * RACI: R/A "Başvuru değerlendirme".
 * Görev: gelen license_request + booking taleplerini değerlendirir.
 *   approve / reject / request_feedback (her ikisi) + swat (license_request için)
 *
 * Bu sayfa kullanıcı profili (kind='user') üzerinden çalışır; route guard
 * `requireUserGovernanceRole('analitik_danisman')` ile backend'de korunur.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell, type NavItem } from '../components/AppShell';
import { useToast } from '../components/Toast';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import { api } from '../services/api';
import { BookingDetailModal } from '../components/BookingDetailModal';
import type {
  Booking,
  LicenseRequestStatus,
  LicenseRequestWithUser,
  ReviewBookingPayload,
} from '../types';

const NAV_ITEMS: NavItem[] = [
  {
    to: '/danisman',
    label: 'Gelen Talepler',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
    ),
  },
];

type Tab = 'bookings' | 'licenses';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: '2-digit' });
}

const STATUS_BADGE: Record<LicenseRequestStatus | Booking['status'], string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-300',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  rejected: 'bg-rose-100 text-rose-800 border-rose-300',
  feedback_requested: 'bg-blue-100 text-blue-800 border-blue-300',
};

const STATUS_LABEL: Record<LicenseRequestStatus | Booking['status'], string> = {
  pending: 'Beklemede',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  feedback_requested: 'Revize',
};

interface ActionModalState {
  kind: 'booking' | 'license';
  id: string;
  title: string;
  action: 'approve' | 'reject' | 'request_feedback' | 'swat';
}

export default function DanismanDashboard() {
  const toast = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [licenseRequests, setLicenseRequests] = useState<LicenseRequestWithUser[]>([]);
  const [counts, setCounts] = useState<{
    licenseRequestsPending: number;
    bookingsPending: number;
  }>({ licenseRequestsPending: 0, bookingsPending: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('bookings');
  const [search, setSearch] = useState('');
  const [actionModal, setActionModal] = useState<ActionModalState | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Detay görünümü: booking card'larına tıklayınca açılan tam BookingDetailModal.
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null);
  const [detailSubmitting, setDetailSubmitting] = useState(false);
  const selectedDetailBooking = useMemo(
    () => (detailBookingId ? bookings.find((b) => b.id === detailBookingId) ?? null : null),
    [bookings, detailBookingId]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.danismanInbox();
      setBookings(res.bookings);
      setLicenseRequests(res.licenseRequests);
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

  useRealtimeEvents('danisman', (type) => {
    if (type.startsWith('booking.') || type === 'license.changed') void load();
  });

  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter(
      (b) =>
        b.projectName.toLowerCase().includes(q) ||
        (b.userFullName ?? '').toLowerCase().includes(q) ||
        b.roomCode.toLowerCase().includes(q)
    );
  }, [bookings, search]);

  const filteredLicenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return licenseRequests;
    return licenseRequests.filter(
      (r) =>
        (r.requestTitle ?? '').toLowerCase().includes(q) ||
        r.licenseName.toLowerCase().includes(q) ||
        r.userFullName.toLowerCase().includes(q)
    );
  }, [licenseRequests, search]);

  function openAction(
    kind: 'booking' | 'license',
    id: string,
    title: string,
    action: ActionModalState['action']
  ) {
    setActionModal({ kind, id, title, action });
    setFeedback('');
  }

  async function submitAction() {
    if (!actionModal) return;
    setSubmitting(true);
    try {
      if (actionModal.kind === 'booking') {
        const payload = {
          action: actionModal.action as 'approve' | 'reject' | 'request_feedback',
          feedback: feedback.trim() || undefined,
        };
        const res = await api.danismanReviewBooking(actionModal.id, payload);
        if (res.autoWaitlisted && actionModal.action === 'approve') {
          toast.push(
            'info',
            `Oda dolu — talep otomatik bekleme listesine alındı (sıra: ${res.waitlistPosition}).`
          );
        } else {
          toast.push('success', 'Booking talebi işlendi.');
        }
      } else {
        await api.danismanReviewLicense(actionModal.id, {
          action: actionModal.action,
          feedback: feedback.trim() || undefined,
        });
        toast.push('success', 'Lisans talebi işlendi.');
      }
      setActionModal(null);
      setFeedback('');
      await load();
    } catch (err) {
      toast.push('error', (err as Error).message || 'İşlem başarısız.');
    } finally {
      setSubmitting(false);
    }
  }

  /** Detay modal'dan gelen review aksiyonu (approve/reject/request_feedback). */
  async function handleDetailReview(payload: ReviewBookingPayload) {
    if (!detailBookingId) return;
    setDetailSubmitting(true);
    try {
      const res = await api.danismanReviewBooking(detailBookingId, payload);
      if (res.autoWaitlisted && payload.action === 'approve') {
        toast.push(
          'info',
          `Oda dolu — talep otomatik bekleme listesine alındı (sıra: ${res.waitlistPosition}).`
        );
      } else {
        toast.push('success', 'Booking talebi işlendi.');
      }
      setDetailBookingId(null);
      await load();
    } catch (err) {
      toast.push('error', (err as Error).message || 'İşlem başarısız.');
    } finally {
      setDetailSubmitting(false);
    }
  }

  return (
    <AppShell
      kind="danisman"
      navItems={NAV_ITEMS}
      profileLink="/danisman"
      roleLabel="Analitik Danışman"
    >
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 text-cyan-200 text-[11px] font-bold uppercase tracking-[0.18em] border border-cyan-400/30 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
            Analitik Danışman
          </div>
          <h1 className="text-3xl font-extrabold text-kt-green-900">Gelen Talepler</h1>
          <p className="text-kt-gray-500 text-sm mt-1">
            Kullanıcı başvurularını değerlendirin — onayla, revize iste, reddet ya da SWAT'a yönlendirin.
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-200">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Booking
            </div>
            <div className="text-2xl font-extrabold text-amber-800 leading-tight">
              {counts.bookingsPending}
            </div>
          </div>
          <div className="px-4 py-2 rounded-xl bg-violet-50 border border-violet-200">
            <div className="text-xs font-bold uppercase tracking-wider text-violet-700">
              Lisans
            </div>
            <div className="text-2xl font-extrabold text-violet-800 leading-tight">
              {counts.licenseRequestsPending}
            </div>
          </div>
        </div>
      </div>

      {/* Tab + arama */}
      <div className="card p-4 mb-4 flex flex-col md:flex-row gap-3 md:items-center justify-between">
        <div className="inline-flex p-1 bg-kt-gray-100 rounded-xl">
          <button
            type="button"
            onClick={() => setTab('bookings')}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
              tab === 'bookings'
                ? 'bg-white text-kt-green-900 shadow-sm'
                : 'text-kt-gray-600 hover:text-kt-green-800'
            }`}
          >
            Oda Talepleri ({bookings.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('licenses')}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
              tab === 'licenses'
                ? 'bg-white text-kt-green-900 shadow-sm'
                : 'text-kt-gray-600 hover:text-kt-green-800'
            }`}
          >
            Lisans Talepleri ({licenseRequests.length})
          </button>
        </div>
        <input
          type="search"
          className="input md:max-w-xs"
          placeholder="Talep / kullanıcı / proje ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={80}
        />
      </div>

      {/* Liste */}
      {loading ? (
        <div className="card p-10 text-center text-kt-gray-500">Yükleniyor…</div>
      ) : tab === 'bookings' ? (
        filteredBookings.length === 0 ? (
          <div className="card p-10 text-center text-kt-gray-500">
            Bekleyen oda talebi yok.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBookings.map((b) => (
              <article
                key={b.id}
                onClick={() => setDetailBookingId(b.id)}
                className="card p-5 cursor-pointer hover:ring-2 hover:ring-kt-gold-300 hover:shadow-md transition"
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
                      {fmtDate(b.startDate)} – {fmtDate(b.endDate)} · {b.periodMonths} ay
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2 py-1 rounded-md border shrink-0 ${STATUS_BADGE[b.status]}`}
                  >
                    {STATUS_LABEL[b.status]}
                  </span>
                </div>
                <p className="text-sm text-kt-gray-700 line-clamp-2 mb-3">
                  {b.projectDescription}
                </p>
                {b.technologies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {b.technologies.slice(0, 6).map((t) => (
                      <span
                        key={t}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-kt-gray-100 text-kt-green-700"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div
                  className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-kt-gray-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[11px] text-kt-gray-400 italic">
                    Karta tıklayarak tüm detayları görüntüleyebilirsiniz →
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openAction('booking', b.id, b.projectName, 'request_feedback')}
                      className="btn-secondary text-sm"
                    >
                      Revize İste
                    </button>
                    <button
                      type="button"
                      onClick={() => openAction('booking', b.id, b.projectName, 'reject')}
                      className="btn-danger text-sm"
                    >
                      Reddet
                    </button>
                    <button
                      type="button"
                      onClick={() => openAction('booking', b.id, b.projectName, 'approve')}
                      className="btn-success text-sm"
                    >
                      Onayla
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      ) : filteredLicenses.length === 0 ? (
        <div className="card p-10 text-center text-kt-gray-500">
          Bekleyen lisans talebi yok.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLicenses.map((r) => {
            const title = r.requestTitle ?? r.licenseName;
            const reviewable = r.status === 'pending' || r.status === 'feedback_requested';
            return (
              <article key={r.id} className="card p-5">
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs text-kt-gray-500">
                        {r.userFullName} · {r.userEmail}
                      </span>
                      {r.reviewTrack === 'swat' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-300">
                          ⚡ SWAT
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-kt-green-900 truncate">{title}</h3>
                    <div className="text-xs text-kt-gray-500 mt-0.5">
                      {r.licenseName}
                      {r.vendor && <span> · {r.vendor}</span>}
                      {r.durationMonths && <span> · {r.durationMonths} ay</span>}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2 py-1 rounded-md border shrink-0 ${STATUS_BADGE[r.status]}`}
                  >
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
                {reviewable && (
                  <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-kt-gray-100">
                    {r.reviewTrack !== 'swat' && (
                      <button
                        type="button"
                        onClick={() => openAction('license', r.id, title, 'swat')}
                        className="btn-ghost text-sm"
                      >
                        ⚡ SWAT'a Gönder
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openAction('license', r.id, title, 'request_feedback')}
                      className="btn-secondary text-sm"
                    >
                      Revize İste
                    </button>
                    <button
                      type="button"
                      onClick={() => openAction('license', r.id, title, 'reject')}
                      className="btn-danger text-sm"
                    >
                      Reddet
                    </button>
                    <button
                      type="button"
                      onClick={() => openAction('license', r.id, title, 'approve')}
                      className="btn-success text-sm"
                    >
                      Onayla
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* Aksiyon modal */}
      {actionModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={() => !submitting && setActionModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-kt-green-900 mb-1">
              {actionModal.action === 'approve' && 'Onaylansın mı?'}
              {actionModal.action === 'reject' && 'Reddedilsin mi?'}
              {actionModal.action === 'request_feedback' && 'Revize iste'}
              {actionModal.action === 'swat' && 'SWAT incelemesine gönder'}
            </h3>
            <p className="text-sm text-kt-gray-500 mb-4">{actionModal.title}</p>
            <label className="label">
              {actionModal.action === 'approve' ? 'Not (opsiyonel)' : 'Açıklama'}
            </label>
            <textarea
              className="textarea"
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              maxLength={1000}
              placeholder={
                actionModal.action === 'reject'
                  ? 'Reddedilme sebebi (kullanıcıya gösterilir)...'
                  : actionModal.action === 'request_feedback'
                    ? 'Kullanıcıdan ne istiyorsunuz?'
                    : actionModal.action === 'swat'
                      ? 'SWAT ekibine iletilecek not...'
                      : 'Opsiyonel onay notu...'
              }
              disabled={submitting}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                disabled={submitting}
                className="btn-ghost"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={submitAction}
                disabled={submitting}
                className={
                  actionModal.action === 'reject'
                    ? 'btn-danger'
                    : actionModal.action === 'approve'
                      ? 'btn-success'
                      : 'btn-primary'
                }
              >
                {submitting ? 'Gönderiliyor…' : 'Onayla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tam booking detayı — projenin tüm context'i + onay/red/feedback aksiyonları. */}
      <BookingDetailModal
        booking={selectedDetailBooking}
        open={!!detailBookingId}
        loading={detailSubmitting}
        onClose={() => !detailSubmitting && setDetailBookingId(null)}
        viewerRole="danisman"
        onReview={handleDetailReview}
      />
    </AppShell>
  );
}
