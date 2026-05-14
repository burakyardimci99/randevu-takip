/**
 * Lisanslarım sayfası — kullanıcı lisans talebi gönderir + kendi taleplerini görür.
 *
 * Form:
 *  - Popüler araçlar dropdown (Cursor, Claude, Copilot vb. — backend /catalog'tan)
 *  - "Diğer" seçilirse: serbest yazılabilir bir satır (lisans adı + sağlayıcı)
 *  - Gerekçe (zorunlu, min 20 char)
 *  - Süre: 1 / 3 / 6 / 12 ay
 *
 * Liste: kendi talepleri durum rozetleri ile (pending/approved/rejected/feedback).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { useToast } from '../components/Toast';
import { api } from '../services/api';
import type { LicenseRequest, LicenseRequestStatus } from '../types';

interface CatalogItem {
  key: string;
  name: string;
  vendor: string;
  category: string;
  tier: 'paid' | 'free' | 'enterprise';
  monthlyUsd: number;
}

const CUSTOM_KEY = 'custom';
const DURATION_OPTIONS: Array<{ value: 1 | 3 | 6 | 12; label: string }> = [
  { value: 1, label: '1 ay' },
  { value: 3, label: '3 ay' },
  { value: 6, label: '6 ay' },
  { value: 12, label: '1 yıl' },
];

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

export default function UserLicenses() {
  const toast = useToast();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [requests, setRequests] = useState<LicenseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [customName, setCustomName] = useState('');
  const [customVendor, setCustomVendor] = useState('');
  const [reason, setReason] = useState('');
  const [durationMonths, setDurationMonths] = useState<1 | 3 | 6 | 12>(3);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, mineRes] = await Promise.all([
        api.licenseCatalog(),
        api.listMyLicenseRequests(),
      ]);
      setCatalog(catRes.items);
      setRequests(mineRes.items);
    } catch (err) {
      toast.push('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const isCustom = selectedKey === CUSTOM_KEY;
  const selectedItem = useMemo(
    () => catalog.find((c) => c.key === selectedKey) ?? null,
    [catalog, selectedKey]
  );

  const canSubmit =
    !!selectedKey &&
    reason.trim().length >= 20 &&
    (!isCustom || (customName.trim().length >= 2));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      await api.createLicenseRequest({
        licenseKey: isCustom ? CUSTOM_KEY : selectedKey,
        licenseName: isCustom ? customName.trim() : (selectedItem?.name ?? ''),
        vendor: isCustom ? customVendor.trim() || null : (selectedItem?.vendor ?? null),
        category: isCustom ? 'Diğer' : (selectedItem?.category ?? null),
        reason: reason.trim(),
        durationMonths,
      });
      toast.push('success', 'Lisans talebin admin onayına gönderildi.');
      // Form reset
      setSelectedKey('');
      setCustomName('');
      setCustomVendor('');
      setReason('');
      setDurationMonths(3);
      await load();
    } catch (err) {
      toast.push('error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // Sort: pending/feedback önce, sonra approved, sonra rejected (kronolojik içinde)
  const sortedRequests = useMemo(() => {
    const order = { pending: 0, feedback_requested: 1, approved: 2, rejected: 3 } as const;
    return [...requests].sort((a, b) => {
      const dx = order[a.status] - order[b.status];
      if (dx !== 0) return dx;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [requests]);

  return (
    <AppShell kind="user">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <header className="mb-8">
          <div className="text-xs uppercase tracking-widest text-kt-gold-700 font-bold mb-2">
            Yazılım Lisansları
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-kt-green-900 mb-2">
            Lisanslarım
          </h1>
          <p className="text-kt-gray-600">
            İhtiyaç duyduğun yapay zeka ve geliştirici araçları için lisans talebi gönder.
            Talepler admin onayından sonra IT ekibine iletilir.
          </p>
        </header>

        {/* ============ FORM ============ */}
        <section className="card p-6 md:p-8 mb-10">
          <h2 className="text-xl font-bold text-kt-green-900 mb-1">Yeni talep</h2>
          <p className="text-sm text-kt-gray-500 mb-6">
            Popüler araçlardan birini seç ya da listede yoksa "Diğer" ile elle yaz.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Araç seçimi */}
            <div>
              <label htmlFor="license-key" className="label">
                Lisans <span className="text-red-500">*</span>
              </label>
              <select
                id="license-key"
                className="input"
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                disabled={submitting || loading}
                required
              >
                <option value="">— Bir araç seç —</option>
                {catalog.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.name} · {c.vendor} · ${c.monthlyUsd}/ay
                  </option>
                ))}
                <option value={CUSTOM_KEY}>
                  Diğer (elle yaz)
                </option>
              </select>
            </div>

            {/* Custom satır — sadece "Diğer" seçildiğinde */}
            {isCustom && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                <div>
                  <label htmlFor="custom-name" className="label">
                    Yazılım adı <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="custom-name"
                    type="text"
                    className="input"
                    placeholder="Örn. Replit, Antigravity, Windsurf..."
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    maxLength={80}
                    disabled={submitting}
                    required
                  />
                </div>
                <div>
                  <label htmlFor="custom-vendor" className="label">
                    Sağlayıcı (opsiyonel)
                  </label>
                  <input
                    id="custom-vendor"
                    type="text"
                    className="input"
                    placeholder="Örn. Replit Inc."
                    value={customVendor}
                    onChange={(e) => setCustomVendor(e.target.value)}
                    maxLength={60}
                    disabled={submitting}
                  />
                </div>
              </div>
            )}

            {/* Süre */}
            <div>
              <label className="label">Süre <span className="text-red-500">*</span></label>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDurationMonths(opt.value)}
                    disabled={submitting}
                    className={`px-4 py-2 rounded-xl font-semibold text-sm transition-colors border ${
                      durationMonths === opt.value
                        ? 'bg-kt-green-600 text-white border-kt-green-600 shadow-kt-green'
                        : 'bg-white text-kt-green-800 border-kt-gray-200 hover:border-kt-green-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Gerekçe */}
            <div>
              <label htmlFor="reason" className="label">
                Talep gerekçesi <span className="text-red-500">*</span>
                <span className="text-xs text-kt-gray-400 font-normal ml-2">
                  ({reason.trim().length}/1000, min 20)
                </span>
              </label>
              <textarea
                id="reason"
                className="textarea"
                placeholder="Bu lisansı hangi proje için, neden istiyorsun? Beklenen fayda nedir?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                rows={4}
                disabled={submitting}
                required
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="btn-primary"
              >
                {submitting ? 'Gönderiliyor…' : 'Talebi Gönder'}
              </button>
            </div>
          </form>
        </section>

        {/* ============ LİSTEM ============ */}
        <section>
          <h2 className="text-xl font-bold text-kt-green-900 mb-4">
            Taleplerim
            {!loading && requests.length > 0 && (
              <span className="ml-2 text-sm text-kt-gray-500 font-normal">
                ({requests.length})
              </span>
            )}
          </h2>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card p-5 animate-pulse h-28" />
              ))}
            </div>
          ) : sortedRequests.length === 0 ? (
            <div className="card p-8 text-center text-kt-gray-500">
              Henüz bir lisans talebin yok. Yukarıdaki formdan ilkini gönderebilirsin.
            </div>
          ) : (
            <div className="space-y-3">
              {sortedRequests.map((r) => {
                const badge = statusBadge(r.status);
                return (
                  <div key={r.id} className="card p-5">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div>
                        <div className="text-lg font-bold text-kt-green-900">
                          {r.licenseName}
                          {r.vendor && (
                            <span className="ml-2 text-sm text-kt-gray-500 font-normal">
                              · {r.vendor}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-kt-gray-500 mt-0.5">
                          {DURATION_OPTIONS.find((d) => d.value === r.durationMonths)?.label} ·
                          Talep tarihi: {fmtDate(r.createdAt)}
                          {r.category && r.category !== 'Diğer' && (
                            <span className="ml-2">· {r.category}</span>
                          )}
                        </div>
                      </div>
                      <span className={badge.cls}>{badge.label}</span>
                    </div>

                    <p className="text-sm text-kt-gray-700 leading-relaxed mt-2 whitespace-pre-line">
                      {r.reason}
                    </p>

                    {r.adminFeedback && (
                      <div
                        className={`mt-4 px-4 py-3 rounded-xl text-sm border-l-4 ${
                          r.status === 'rejected'
                            ? 'bg-red-50 border-red-400 text-red-900'
                            : r.status === 'feedback_requested'
                              ? 'bg-blue-50 border-blue-400 text-blue-900'
                              : 'bg-kt-green-50 border-kt-green-400 text-kt-green-900'
                        }`}
                      >
                        <div className="font-semibold text-xs uppercase tracking-wider mb-1 opacity-70">
                          Admin notu
                        </div>
                        <div className="whitespace-pre-line">{r.adminFeedback}</div>
                        {r.reviewedAt && (
                          <div className="text-xs opacity-60 mt-2">
                            {fmtDate(r.reviewedAt)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
