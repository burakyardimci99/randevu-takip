/**
 * Admin Lisans Talepleri sekmesi.
 *
 * Pending + feedback_requested talepleri üstte gösterir. Her talep için
 * approve / reject / request_feedback aksiyonu modal ile yapılabilir.
 *
 * Booking review flow'unun aynısı, ayrı endpoint:
 *   POST /api/admin/licenses/requests/:id/review
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { useToast } from './Toast';
import type { LicenseRequestStatus, LicenseRequestWithUser } from '../types';

type ReviewAction = 'approve' | 'reject' | 'request_feedback';

const DURATION_LABEL: Record<number, string> = {
  1: '1 ay',
  3: '3 ay',
  6: '6 ay',
  12: '1 yıl',
};

function statusBadge(status: LicenseRequestStatus) {
  switch (status) {
    case 'pending':
      return { label: 'Beklemede', cls: 'badge-pending' };
    case 'approved':
      return { label: 'Onaylandı', cls: 'badge-approved' };
    case 'rejected':
      return { label: 'Reddedildi', cls: 'badge-rejected' };
    case 'feedback_requested':
      return { label: 'Revize İsteniyor', cls: 'badge-feedback' };
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function AdminLicenseRequestsTab() {
  const toast = useToast();
  const [items, setItems] = useState<LicenseRequestWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | LicenseRequestStatus>('all');
  const [search, setSearch] = useState('');

  const [modalReq, setModalReq] = useState<LicenseRequestWithUser | null>(null);
  const [modalAction, setModalAction] = useState<ReviewAction | null>(null);
  const [modalFeedback, setModalFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.adminListLicenseRequests();
      setItems(res.items);
    } catch (err) {
      toast.push('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.licenseName.toLowerCase().includes(q) ||
        r.userFullName.toLowerCase().includes(q) ||
        r.userEmail.toLowerCase().includes(q) ||
        (r.vendor ?? '').toLowerCase().includes(q) ||
        (r.userDepartment ?? '').toLowerCase().includes(q)
      );
    });
  }, [items, statusFilter, search]);

  const counts = useMemo(() => {
    return {
      all: items.length,
      pending: items.filter((r) => r.status === 'pending').length,
      feedback_requested: items.filter((r) => r.status === 'feedback_requested').length,
      approved: items.filter((r) => r.status === 'approved').length,
      rejected: items.filter((r) => r.status === 'rejected').length,
    };
  }, [items]);

  function openModal(req: LicenseRequestWithUser, action: ReviewAction) {
    setModalReq(req);
    setModalAction(action);
    setModalFeedback(req.adminFeedback ?? '');
  }

  function closeModal() {
    setModalReq(null);
    setModalAction(null);
    setModalFeedback('');
  }

  async function submitReview() {
    if (!modalReq || !modalAction || submitting) return;
    setSubmitting(true);
    try {
      await api.adminReviewLicenseRequest(modalReq.id, {
        action: modalAction,
        adminFeedback: modalFeedback.trim() || null,
      });
      const actionLabel =
        modalAction === 'approve'
          ? 'onaylandı'
          : modalAction === 'reject'
            ? 'reddedildi'
            : 'revize istendi';
      toast.push('success', `Talep ${actionLabel}.`);
      closeModal();
      await load();
    } catch (err) {
      toast.push('error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Filter + search */}
      <div className="card p-4 md:p-5 mb-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="flex gap-1.5 p-1 bg-kt-gray-100 rounded-xl self-start flex-wrap">
            {[
              { key: 'all' as const, label: `Tümü (${counts.all})` },
              { key: 'pending' as const, label: `Beklemede (${counts.pending})` },
              { key: 'feedback_requested' as const, label: `Revize (${counts.feedback_requested})` },
              { key: 'approved' as const, label: `Onaylanan (${counts.approved})` },
              { key: 'rejected' as const, label: `Reddedilen (${counts.rejected})` },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all ${
                  statusFilter === f.key
                    ? 'bg-white text-kt-green-900 shadow-kt-soft'
                    : 'text-kt-gray-500 hover:text-kt-green-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 md:max-w-md">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-kt-gray-400"
              fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="search"
              className="input pl-10"
              placeholder="Lisans, kullanıcı veya departman ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={80}
            />
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-5 animate-pulse h-28" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center text-kt-gray-500">
          {statusFilter === 'all'
            ? 'Henüz lisans talebi yok.'
            : 'Bu filtreye uyan talep yok.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => {
            const badge = statusBadge(r.status);
            const canReview = r.status === 'pending' || r.status === 'feedback_requested';
            return (
              <div key={r.id} className="card p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <span className="text-lg font-bold text-kt-green-900">
                        {r.licenseName}
                      </span>
                      {r.vendor && (
                        <span className="text-sm text-kt-gray-500">· {r.vendor}</span>
                      )}
                      <span className={badge.cls}>{badge.label}</span>
                    </div>
                    <div className="text-sm text-kt-gray-600">
                      <span className="font-semibold">{r.userFullName}</span>
                      <span className="text-kt-gray-400"> · </span>
                      <span>{r.userEmail}</span>
                      {r.userDepartment && (
                        <>
                          <span className="text-kt-gray-400"> · </span>
                          <span>{r.userDepartment}</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-kt-gray-500 mt-0.5">
                      {DURATION_LABEL[r.durationMonths]} · Talep: {fmtDate(r.createdAt)}
                      {r.reviewedAt && (
                        <span> · Review: {fmtDate(r.reviewedAt)} {r.reviewerName ? `(${r.reviewerName})` : ''}</span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-sm text-kt-gray-700 leading-relaxed whitespace-pre-line mb-3">
                  {r.reason}
                </p>

                {r.adminFeedback && (
                  <div className="mb-3 px-4 py-2 rounded-lg bg-kt-gray-50 border border-kt-gray-200 text-xs text-kt-gray-700">
                    <div className="font-bold uppercase tracking-wider text-kt-gray-500 mb-1">Önceki admin notu</div>
                    <div className="whitespace-pre-line">{r.adminFeedback}</div>
                  </div>
                )}

                {canReview && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-kt-gray-100">
                    <button
                      onClick={() => openModal(r, 'approve')}
                      className="btn-success text-sm"
                    >
                      Onayla
                    </button>
                    <button
                      onClick={() => openModal(r, 'request_feedback')}
                      className="btn-secondary text-sm"
                    >
                      Revize İste
                    </button>
                    <button
                      onClick={() => openModal(r, 'reject')}
                      className="btn-danger text-sm"
                    >
                      Reddet
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Review modal */}
      {modalReq && modalAction && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-kt-green-900 mb-1">
              {modalAction === 'approve' && `${modalReq.licenseName} onaylansın mı?`}
              {modalAction === 'reject' && `${modalReq.licenseName} reddedilsin mi?`}
              {modalAction === 'request_feedback' && `Revize iste`}
            </h3>
            <p className="text-sm text-kt-gray-500 mb-4">
              Talep eden: <span className="font-semibold">{modalReq.userFullName}</span> · {modalReq.userEmail}
            </p>

            <div className="mb-4">
              <label htmlFor="modal-feedback" className="label">
                {modalAction === 'approve' ? 'Not (opsiyonel)' : 'Açıklama (önerilir)'}
              </label>
              <textarea
                id="modal-feedback"
                className="textarea"
                placeholder={
                  modalAction === 'reject'
                    ? 'Neden reddediyorsun? (kullanıcıya gösterilecek)'
                    : modalAction === 'request_feedback'
                      ? 'Kullanıcıdan ne istiyorsun? (örn. daha detaylı gerekçe)'
                      : 'IT ekibine veya kullanıcıya iletilecek not.'
                }
                value={modalFeedback}
                onChange={(e) => setModalFeedback(e.target.value)}
                maxLength={1000}
                rows={4}
                disabled={submitting}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={closeModal} disabled={submitting} className="btn-ghost">
                İptal
              </button>
              <button
                onClick={submitReview}
                disabled={submitting}
                className={
                  modalAction === 'approve'
                    ? 'btn-success'
                    : modalAction === 'reject'
                      ? 'btn-danger'
                      : 'btn-primary'
                }
              >
                {submitting
                  ? 'İşleniyor…'
                  : modalAction === 'approve'
                    ? 'Onayla'
                    : modalAction === 'reject'
                      ? 'Reddet'
                      : 'Revize İste'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
