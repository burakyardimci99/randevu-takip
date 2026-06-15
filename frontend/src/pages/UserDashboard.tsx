/**
 * Kullanıcı dashboard'u — aktif (onaylı ve süresi devam eden) randevusu olan
 * kullanıcının giriş sonrası ana sayfası.
 *
 *  - Mevcut randevu/iş bilgileri (oda, tarih aralığı, yaşam döngüsü aşaması)
 *  - Kullanıcının kendisinin düzenleyebildiği ilerleme notu
 *  - Kolay erişilebilir "Yardım İste" butonu
 *
 * Aktif randevu yoksa kullanıcı oda seçim ekranına yönlendirilir.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { ProjectLifecycleBar } from '../components/governance/ProjectLifecycleBar';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { ymdLocal } from '../lib/utils';
import type { Booking } from '../types';

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

const WEEKDAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

/** Onaylı ve bugünü kapsayan (veya gelecekte başlayacak) booking'ler aktiftir. */
function findActiveBookings(bookings: Booking[]): Booking[] {
  const today = ymdLocal();
  return bookings.filter((b) => b.status === 'approved' && b.endDate >= today);
}

export default function UserDashboard() {
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listUserBookings();
      setBookings(res.bookings);
    } catch (err) {
      toast.push('error', (err as Error).message || 'Bilgiler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(() => findActiveBookings(bookings), [bookings]);

  // Aktif randevu yoksa bu sayfanın anlamı yok — oda seçimine yönlendir.
  useEffect(() => {
    if (!loading && active.length === 0) {
      navigate('/rooms', { replace: true });
    }
  }, [loading, active.length, navigate]);

  function startEditNote(b: Booking) {
    setEditingNoteId(b.id);
    setNote(b.progressNote ?? '');
  }

  async function saveNote(bookingId: string) {
    setSavingNote(true);
    try {
      const res = await api.updateBookingProgress(bookingId, note.trim());
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? res.booking : b)));
      setEditingNoteId(null);
      toast.push('success', 'İlerleme notunuz kaydedildi.');
    } catch (err) {
      toast.push('error', (err as Error).message || 'Not kaydedilemedi.');
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <AppShell kind="user">
      <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-kt-green-900 mb-1">
            Hoş geldiniz{auth.user ? `, ${auth.user.fullName.split(' ')[0]}` : ''}
          </h1>
          <p className="text-kt-gray-500">
            Aktif çalışmanızın özeti ve ilerleme durumunuz.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/rooms" className="btn-secondary">Odalara Göz At</Link>
          <Link to="/bookings" className="btn-secondary">Tüm Taleplerim →</Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-3 border-kt-gold-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="space-y-6">
          {active.map((b) => (
            <section key={b.id} className="card p-6">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-xs uppercase tracking-widest text-kt-gold-700 font-bold mb-1">
                    Aktif Çalışma · {b.roomCode}
                  </div>
                  <h2 className="text-2xl font-extrabold text-kt-green-900">{b.projectName}</h2>
                  <p className="text-sm text-kt-gray-500 mt-1">
                    {b.roomName} · {fmtDate(b.startDate)} — {fmtDate(b.endDate)}
                    {b.weekdays.length < 7 && (
                      <> · {b.weekdays.map((d) => WEEKDAY_SHORT[d - 1]).join(', ')}</>
                    )}
                  </p>
                </div>
              </div>

              <div className="my-5">
                <ProjectLifecycleBar stage={b.lifecycleStage} />
              </div>

              <div className="grid md:grid-cols-2 gap-5">
                <div className="rounded-xl bg-kt-gray-50 border border-kt-gray-100 p-4">
                  <h3 className="text-sm font-bold text-kt-green-900 mb-2">Proje Özeti</h3>
                  <p className="text-sm text-kt-gray-600 whitespace-pre-wrap line-clamp-6">
                    {b.projectDescription}
                  </p>
                </div>

                {/* Kullanıcının kendisinin düzenlediği ilerleme alanı */}
                <div className="rounded-xl bg-white border border-kt-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-kt-green-900">
                      Ne Üzerinde Çalışıyorum? / İlerleme
                    </h3>
                    {editingNoteId !== b.id && (
                      <button
                        type="button"
                        onClick={() => startEditNote(b)}
                        className="text-xs font-semibold text-kt-violet-600 hover:text-kt-violet-800 transition-colors"
                      >
                        Düzenle
                      </button>
                    )}
                  </div>

                  {editingNoteId === b.id ? (
                    <div>
                      <textarea
                        className="textarea w-full"
                        rows={5}
                        maxLength={2000}
                        value={note}
                        autoFocus
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Bu hafta neler yaptınız, hangi aşamadasınız, planınız ne?"
                      />
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-kt-gray-400">{note.length} / 2000</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingNoteId(null)}
                            disabled={savingNote}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-kt-gray-100 text-kt-green-800 hover:bg-kt-gray-200"
                          >
                            Vazgeç
                          </button>
                          <button
                            type="button"
                            onClick={() => void saveNote(b.id)}
                            disabled={savingNote}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-kt-green-700 text-white hover:bg-kt-green-800 disabled:opacity-50"
                          >
                            {savingNote ? 'Kaydediliyor…' : 'Kaydet'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : b.progressNote ? (
                    <div>
                      <p className="text-sm text-kt-gray-700 whitespace-pre-wrap">{b.progressNote}</p>
                      {b.progressUpdatedAt && (
                        <p className="text-[11px] text-kt-gray-400 mt-2">
                          Son güncelleme: {b.progressUpdatedAt}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-kt-gray-400 italic">
                      Henüz ilerleme notu eklemediniz. "Düzenle" ile çalışmanızı paylaşın —
                      lab ekibi durumunuzu buradan takip eder.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link to="/bookings" className="btn-secondary text-sm">
                  Randevu &amp; Aşama Detayları
                </Link>
                <Link to="/takvim" className="btn-secondary text-sm">
                  Takvimim
                </Link>
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Yardım İste: AppShell'in sağ-alttaki sabit "Destek" butonu her sayfada
          erişilebilir — dashboard'da ayrıca yukarıdaki kartlardan ulaşılır. */}
    </AppShell>
  );
}
