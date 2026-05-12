import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { BookingModal } from '../components/BookingModal';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import { api } from '../services/api';
import type { Booking, CreateBookingPayload, Room } from '../types';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function UserBookings() {
  const toast = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Booking | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState<Booking | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, rRes] = await Promise.all([api.listUserBookings(), api.listUserRooms()]);
      setBookings(bRes.bookings);
      setRooms(rRes.rooms);
    } catch (err) {
      toast.push('error', (err as Error).message || 'Talepler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time: kendi booking'in admin tarafından onaylanırsa anında refresh
  useRealtimeEvents('user', (type, data) => {
    if (
      type === 'booking.reviewed' ||
      type === 'booking.created' ||
      type === 'booking.updated' ||
      type === 'waitlist.changed'
    ) {
      load();
      if (type === 'booking.reviewed' && data && typeof data === 'object') {
        const status = (data as { status?: string }).status;
        if (status === 'approved') toast.push('success', 'Talebiniz onaylandı.');
        else if (status === 'rejected') toast.push('info', 'Talebiniz reddedildi.');
        else if (status === 'feedback_requested')
          toast.push('info', 'Admin sizden düzeltme istedi.');
      }
    }
  });

  function startEdit(booking: Booking) {
    setEditing(booking);
  }

  async function submitEdit(payload: CreateBookingPayload) {
    if (!editing) return;
    setSubmitting(true);
    try {
      await api.updateBooking(editing.id, payload);
      toast.push('success', 'Talebiniz güncellendi ve yeniden admin onayına gönderildi.');
      setEditing(null);
      await load();
    } catch (err) {
      toast.push('error', (err as Error).message || 'Güncelleme başarısız.');
    } finally {
      setSubmitting(false);
    }
  }

  async function doWithdraw(booking: Booking) {
    setWithdrawing(booking.id);
    try {
      await api.deleteBooking(booking.id);
      toast.push('info', 'Talebiniz geri çekildi.');
      setConfirmWithdraw(null);
      await load();
    } catch (err) {
      toast.push('error', (err as Error).message || 'Geri çekme başarısız.');
    } finally {
      setWithdrawing(null);
    }
  }

  function canModify(status: Booking['status']) {
    return status === 'pending' || status === 'feedback_requested';
  }

  /** Edit modal için oda objesini bul (booking sadece roomId tutuyor). */
  function roomForBooking(b: Booking): Room | null {
    return rooms.find((r) => r.id === b.roomId) ?? null;
  }

  return (
    <AppShell kind="user">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-kt-green-900 mb-1">Taleplerim</h1>
        <p className="text-kt-gray-500">Gönderdiğiniz kiralama talepleri ve durumları.</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-6 animate-pulse h-32" />
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-4">📭</div>
          <h3 className="text-xl font-bold text-kt-green-800 mb-2">Henüz bir talebiniz yok</h3>
          <p className="text-kt-gray-500 mb-6">
            AI Lab odalarımızdan birini seçip ilk kiralama talebinizi gönderin.
          </p>
          <Link to="/rooms" className="btn-primary inline-flex">
            Odaları Görüntüle
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const modifiable = canModify(b.status);
            const isBeingWithdrawn = withdrawing === b.id;
            return (
              <article key={b.id} className="card p-6 animate-fade-in">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold text-kt-gold-600 tracking-wider">{b.roomCode}</span>
                      <span className="text-kt-gray-300">·</span>
                      <span className="text-sm text-kt-gray-500">{b.roomName}</span>
                    </div>
                    <h3 className="text-xl font-bold text-kt-green-900 mb-1">{b.projectName}</h3>
                    <div className="text-sm text-kt-gray-600">
                      {fmtDate(b.startDate)} — {fmtDate(b.endDate)} · {b.periodMonths} ay
                    </div>
                  </div>
                  <StatusBadge status={b.status} />
                </div>

                <p className="text-sm text-kt-gray-700 mb-3 line-clamp-2">{b.projectDescription}</p>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {b.technologies.slice(0, 8).map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-md bg-kt-gray-100 text-kt-green-700 text-xs font-medium">
                      {t}
                    </span>
                  ))}
                  {b.technologies.length > 8 && (
                    <span className="px-2 py-0.5 text-xs text-kt-gray-500">
                      +{b.technologies.length - 8} daha
                    </span>
                  )}
                </div>

                {b.adminFeedback && (
                  <div
                    className={`mt-4 p-4 rounded-xl border-l-4 ${
                      b.status === 'rejected'
                        ? 'bg-red-50 border-red-400'
                        : b.status === 'feedback_requested'
                        ? 'bg-blue-50 border-blue-400'
                        : 'bg-emerald-50 border-emerald-400'
                    }`}
                  >
                    <div className="text-xs font-semibold uppercase tracking-wider mb-1 text-kt-green-700">
                      Admin Geri Bildirimi
                    </div>
                    <p className="text-sm text-kt-green-800 whitespace-pre-wrap">{b.adminFeedback}</p>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-kt-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-xs text-kt-gray-400 flex items-center gap-3 flex-wrap">
                    <span>Gönderildi: {fmtDate(b.createdAt)}</span>
                    {b.reviewedAt && <span>İncelendi: {fmtDate(b.reviewedAt)}</span>}
                  </div>
                  {modifiable && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(b)}
                        disabled={isBeingWithdrawn}
                        className="btn-secondary text-sm"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                        </svg>
                        Düzenle
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmWithdraw(b)}
                        disabled={isBeingWithdrawn}
                        className="btn text-sm bg-red-50 text-red-700 hover:bg-red-100 border border-red-100"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2"/>
                        </svg>
                        Geri Çek
                      </button>
                    </div>
                  )}
                  {!modifiable && (
                    <span className="text-xs text-kt-gray-400 italic">
                      Onaylanmış/reddedilmiş talepler değiştirilemez.
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      <BookingModal
        room={editing ? roomForBooking(editing) : null}
        open={!!editing}
        loading={submitting}
        editingBooking={editing}
        onClose={() => !submitting && setEditing(null)}
        onSubmit={submitEdit}
      />

      {/* Withdraw Confirmation */}
      {confirmWithdraw && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-kt-green-950/70 backdrop-blur-sm animate-fade-in"
          onClick={() => !withdrawing && setConfirmWithdraw(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-kt-card max-w-md w-full p-6 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-kt-green-900 mb-1">Talebi geri çek?</h3>
                <p className="text-sm text-kt-gray-600">
                  <span className="font-semibold">{confirmWithdraw.projectName}</span> projesi için
                  gönderdiğin <span className="font-mono text-xs">{confirmWithdraw.roomCode}</span> talebi kaldırılacak.
                  Bu işlem geri alınamaz.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmWithdraw(null)}
                disabled={!!withdrawing}
                className="btn-ghost"
              >
                Vazgeç
              </button>
              <button
                onClick={() => doWithdraw(confirmWithdraw)}
                disabled={!!withdrawing}
                className="btn-danger"
              >
                {withdrawing ? 'Çekiliyor...' : 'Evet, geri çek'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
