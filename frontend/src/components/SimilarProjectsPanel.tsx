/**
 * Benzer projeler paneli — semantic search sonuçlarını gösterir.
 *
 * Kullanım:
 *  - BookingModal içinde: kullanıcı form doldururken otomatik (debounced) sorgulanır.
 *  - UserBookings'te: bir booking üzerine tıklanınca "benzer projeler" çekilir.
 *
 * Görsellik:
 *  - Similarity skoru bar olarak (0.0..1.0)
 *  - Etiketler + kullanıcı (geçmiş ekiplerle bağlantı kurma ipucu)
 *  - "Geçmişte yapılmış" hint'i
 */
import type { SimilarBooking } from '../types';

interface SimilarProjectsPanelProps {
  results: SimilarBooking[];
  loading: boolean;
  /** En az kaç karakterlik input girilince sorgu açılır — UI hint için. */
  minQueryLength?: number;
}

function similarityBar(score: number): { width: string; cls: string; label: string } {
  const pct = Math.min(100, Math.max(0, Math.round(score * 100)));
  if (score >= 0.7) return { width: `${pct}%`, cls: 'bg-emerald-500', label: 'Çok benzer' };
  if (score >= 0.5) return { width: `${pct}%`, cls: 'bg-blue-500', label: 'Benzer' };
  if (score >= 0.3) return { width: `${pct}%`, cls: 'bg-amber-500', label: 'İlgili' };
  return { width: `${pct}%`, cls: 'bg-kt-gray-300', label: 'Az ilgili' };
}

function statusLabel(s: string): string {
  switch (s) {
    case 'approved':
      return 'Onaylı';
    case 'pending':
      return 'Beklemede';
    case 'feedback_requested':
      return 'Düzeltme';
    case 'rejected':
      return 'Reddedildi';
    default:
      return s;
  }
}

function statusCls(s: string): string {
  switch (s) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'pending':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'feedback_requested':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'rejected':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    default:
      return 'bg-kt-gray-100 text-kt-gray-600 border-kt-gray-200';
  }
}

export function SimilarProjectsPanel({
  results,
  loading,
  minQueryLength,
}: SimilarProjectsPanelProps) {
  return (
    <div className="rounded-xl border border-kt-gold-200 bg-kt-gold-50/30 p-4">
      <div className="flex items-start gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-kt-gold-400 to-kt-gold-600 text-kt-green-900 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-bold text-kt-green-900 flex items-center gap-2">
            Geçmişte benzer projeler
            {loading && (
              <span className="inline-block w-3 h-3 border-2 border-kt-gold-400 border-t-transparent rounded-full animate-spin" />
            )}
          </h4>
          <p className="text-[11px] text-kt-gray-500 mt-0.5">
            AI Lab'da daha önce yapılmış benzer projeler — fikir + ekip bağlantısı için.
          </p>
        </div>
      </div>

      {loading && results.length === 0 ? (
        <div className="text-xs text-kt-gray-500 italic py-2">Aranıyor…</div>
      ) : results.length === 0 ? (
        <div className="text-xs text-kt-gray-500 italic py-2">
          {minQueryLength
            ? `Daha fazla detay yazın (min ${minQueryLength} karakter), benzerler görünsün.`
            : 'Henüz eşleşen proje yok — projeniz özgün görünüyor.'}
        </div>
      ) : (
        <ul className="space-y-2">
          {results.map((r) => {
            const sim = similarityBar(r.similarity);
            return (
              <li
                key={r.bookingId}
                className="bg-white rounded-lg border border-kt-gold-100 p-3"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-kt-green-900 truncate flex items-center gap-1.5">
                      {r.projectName}
                      {r.isOwn && (
                        <span
                          title="Sizin geçmiş projeniz"
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-kt-gold-100 text-kt-gold-800 border border-kt-gold-200"
                        >
                          ⓘ Sizin projeniz
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-kt-gray-500 mt-0.5 flex items-center gap-1">
                      {r.anonymized && !r.isOwn && (
                        <svg
                          className="w-3 h-3 text-kt-gray-400"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          viewBox="0 0 24 24"
                          aria-label="Anonim — kullanıcı ismi gizlendi"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                      <span>
                        {r.userFullName} · {r.roomCode}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${statusCls(r.status)} shrink-0`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </div>
                <p className="text-xs text-kt-gray-600 line-clamp-2 mb-2">
                  {r.projectDescription}
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-kt-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${sim.cls}`} style={{ width: sim.width }} />
                  </div>
                  <span className="text-[10px] font-bold text-kt-gray-600 w-20 text-right tabular-nums">
                    {sim.label} · {(r.similarity * 100).toFixed(0)}%
                  </span>
                </div>
                {r.technologies.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {r.technologies.slice(0, 5).map((t) => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-kt-green-50 text-kt-green-800"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
