import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Booking, ReviewBookingPayload, SimilarBooking } from '../types';
import { SimilarProjectsPanel } from './SimilarProjectsPanel';
import { StatusBadge } from './StatusBadge';

interface BookingDetailModalProps {
  booking: Booking | null;
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onReview: (action: ReviewBookingPayload) => Promise<void>;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR');
}

export function BookingDetailModal({ booking, open, loading, onClose, onReview }: BookingDetailModalProps) {
  const [mode, setMode] = useState<'idle' | 'feedback' | 'reject'>('idle');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<SimilarBooking[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  // Modal açılınca admin için benzer projeleri çek
  useEffect(() => {
    if (!open || !booking) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setSimilarLoading(true);
        const res = await api.adminFindSimilar({
          bookingId: booking.id,
          limit: 4,
          minSimilarity: 0.25,
        });
        if (!cancelled) setSimilar(res.results);
      } catch {
        if (!cancelled) setSimilar([]);
      } finally {
        if (!cancelled) setSimilarLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, booking]);

  if (!open || !booking) return null;

  function reset() {
    setMode('idle');
    setFeedback('');
    setError(null);
  }

  async function handleApprove() {
    setError(null);
    await onReview({ action: 'approve' });
    reset();
  }

  async function handleReject() {
    if (feedback.trim().length > 0 && feedback.trim().length < 5) {
      setError('Mesaj en az 5 karakter olmalı.');
      return;
    }
    setError(null);
    await onReview({ action: 'reject', feedback: feedback.trim() || undefined });
    reset();
  }

  async function handleFeedback() {
    const v = feedback.trim();
    if (v.length < 10) {
      setError('Feedback en az 10 karakter olmalı.');
      return;
    }
    setError(null);
    await onReview({ action: 'request_feedback', feedback: v });
    reset();
  }

  // Admin tüm statusları yeniden inceleyebilir (admin = sınırsız yetki).
  // Onaylanmış bir talep yine reddedilebilir/feedback istenebilir; reddedilen onaylanabilir.
  const reviewable = true;
  const isReReview =
    booking.status === 'approved' || booking.status === 'rejected';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-kt-green-950/70 backdrop-blur-sm animate-fade-in"
      onClick={() => !loading && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-kt-card max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-kt-gray-100 bg-gradient-to-r from-kt-green-800 to-kt-green-900 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider opacity-80 mb-1">
                Kiralama Talebi · {booking.roomCode}
              </div>
              <h2 className="text-2xl font-bold mb-2">{booking.projectName}</h2>
              <StatusBadge status={booking.status} />
            </div>
            <button
              onClick={onClose}
              disabled={loading}
              className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto scrollbar-thin px-6 py-5 space-y-5 flex-1">
          {isReReview && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-kt-gold-50 border border-kt-gold-200 text-kt-gold-900">
              <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <div className="text-sm">
                <div className="font-bold mb-0.5">Bu talep daha önce {booking.status === 'approved' ? 'onaylanmıştı' : 'reddedilmişti'}.</div>
                <p className="text-kt-gold-800">
                  Admin olarak kararı değiştirebilir, yeniden inceleyebilir veya kullanıcıdan düzeltme isteyebilirsiniz.
                  Yeni karar audit log'a kaydedilir.
                </p>
              </div>
            </div>
          )}

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-kt-gray-50 rounded-xl p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-kt-gray-500 mb-1">Kullanıcı</div>
              <div className="font-semibold text-kt-green-900">{booking.userFullName}</div>
              <div className="text-sm text-kt-gray-600 break-all">{booking.userEmail}</div>
            </div>
            <div className="bg-kt-gray-50 rounded-xl p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-kt-gray-500 mb-1">Oda</div>
              <div className="font-semibold text-kt-green-900">{booking.roomName}</div>
              <div className="text-sm text-kt-gray-600">Kod: {booking.roomCode}</div>
            </div>
            <div className="bg-kt-gray-50 rounded-xl p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-kt-gray-500 mb-1">Periyot</div>
              <div className="font-semibold text-kt-green-900">{booking.periodMonths} Ay</div>
              <div className="text-sm text-kt-gray-600">{fmtDate(booking.startDate)} — {fmtDate(booking.endDate)}</div>
            </div>
            <div className="bg-kt-gray-50 rounded-xl p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-kt-gray-500 mb-1">Talep Zamanı</div>
              <div className="font-semibold text-kt-green-900">{fmtDateTime(booking.createdAt)}</div>
              {booking.reviewedAt && (
                <div className="text-sm text-kt-gray-600">İncelendi: {fmtDateTime(booking.reviewedAt)}</div>
              )}
            </div>
          </section>

          <section>
            <h3 className="font-bold text-kt-green-900 mb-2">Proje Açıklaması</h3>
            <p className="text-kt-green-800 whitespace-pre-wrap leading-relaxed">{booking.projectDescription}</p>
          </section>

          <section>
            <h3 className="font-bold text-kt-green-900 mb-2">Yardım Talebi</h3>
            <p className="text-kt-green-800 whitespace-pre-wrap leading-relaxed">{booking.helpNeeded}</p>
          </section>

          <section>
            <h3 className="font-bold text-kt-green-900 mb-2">
              Teknolojiler <span className="text-sm text-kt-gray-500 font-normal">({booking.technologies.length})</span>
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {booking.technologies.map((t) => (
                <span key={t} className="px-3 py-1 rounded-lg bg-kt-gold-50 text-kt-gold-700 text-sm font-semibold border border-kt-gold-100">
                  {t}
                </span>
              ))}
            </div>
          </section>

          {/* Semantic search: bu projeye benzer geçmiş projeler */}
          {(similar.length > 0 || similarLoading) && (
            <section>
              <SimilarProjectsPanel results={similar} loading={similarLoading} />
            </section>
          )}

          {booking.adminFeedback && (
            <section>
              <h3 className="font-bold text-kt-green-900 mb-2">Önceki Geri Bildirim</h3>
              <div className="p-4 bg-blue-50 border-l-4 border-blue-400 rounded-r-xl">
                <p className="text-blue-900 whitespace-pre-wrap leading-relaxed">{booking.adminFeedback}</p>
              </div>
            </section>
          )}

          {reviewable && mode !== 'idle' && (
            <section className="animate-fade-in">
              <label className="label">
                {mode === 'feedback' ? 'Kullanıcıdan Beklenen Düzeltme' : 'Red Sebebi (opsiyonel)'}
              </label>
              <textarea
                className="textarea"
                rows={4}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                maxLength={2000}
                placeholder={
                  mode === 'feedback'
                    ? 'Ör: Lütfen proje açıklamasında hedef kitleyi de belirtin.'
                    : 'Ör: Bu hafta için tüm odalar workshop için ayrıldı.'
                }
              />
              {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            </section>
          )}
        </div>

        {reviewable && (
          <div className="px-6 py-4 border-t border-kt-gray-100 bg-kt-gray-50 flex flex-wrap items-center justify-end gap-2">
            {mode === 'idle' ? (
              <>
                <button onClick={onClose} className="btn-ghost" disabled={loading}>Kapat</button>
                <button onClick={() => setMode('feedback')} className="btn-secondary" disabled={loading}>
                  💬 Düzeltme İste
                </button>
                <button onClick={() => setMode('reject')} className="btn-danger" disabled={loading}>
                  ✕ Reddet
                </button>
                <button onClick={handleApprove} className="btn-success" disabled={loading}>
                  ✓ Onayla
                </button>
              </>
            ) : (
              <>
                <button onClick={reset} className="btn-ghost" disabled={loading}>Vazgeç</button>
                {mode === 'feedback' ? (
                  <button onClick={handleFeedback} className="btn-primary" disabled={loading}>
                    {loading ? 'Gönderiliyor...' : 'Geri Bildirimi Gönder'}
                  </button>
                ) : (
                  <button onClick={handleReject} className="btn-danger" disabled={loading}>
                    {loading ? 'Gönderiliyor...' : 'Reddi Onayla'}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {!reviewable && (
          <div className="px-6 py-4 border-t border-kt-gray-100 bg-kt-gray-50 flex items-center justify-end">
            <button onClick={onClose} className="btn-primary">Kapat</button>
          </div>
        )}
      </div>
    </div>
  );
}
