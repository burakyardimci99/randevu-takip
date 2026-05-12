/**
 * Admin takvim sayfası — bookings calendar view.
 *
 * - Tüm bookings görünür (status renkleriyle).
 * - Booking chip click → BookingDetailModal (admin onay/red akışı).
 * - Real-time event'ler ile otomatik refresh.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { BookingDetailModal } from '../components/BookingDetailModal';
import { CalendarView } from '../components/CalendarView';
import { useToast } from '../components/Toast';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import { api } from '../services/api';
import type { Booking, ReviewBookingPayload } from '../types';

export default function AdminCalendar() {
  const toast = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listAdminBookings();
      setBookings(res.bookings);
    } catch (err) {
      toast.push('error', (err as Error).message || 'Talepler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeEvents('admin', (type) => {
    if (
      type === 'booking.created' ||
      type === 'booking.updated' ||
      type === 'booking.reviewed' ||
      type === 'booking.withdrawn'
    ) {
      load();
    }
  });

  async function review(payload: ReviewBookingPayload) {
    if (!selected) return;
    setReviewing(true);
    try {
      await api.reviewBooking(selected.id, payload);
      toast.push(
        'success',
        payload.action === 'approve'
          ? 'Talep onaylandı.'
          : payload.action === 'reject'
          ? 'Talep reddedildi.'
          : 'Düzeltme isteği iletildi.'
      );
      setSelected(null);
      await load();
    } catch (err) {
      toast.push('error', (err as Error).message || 'İşlem başarısız.');
    } finally {
      setReviewing(false);
    }
  }

  return (
    <AppShell kind="admin">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-kt-green-900 mb-1">Takvim</h1>
        <p className="text-kt-gray-500 text-sm">
          Tüm kiralama taleplerinin aylık görünümü · {bookings.length} talep
        </p>
      </div>

      {loading ? (
        <div className="card p-6 animate-pulse h-[600px]" />
      ) : (
        <CalendarView
          bookings={bookings}
          onBookingClick={(b) => setSelected(b)}
        />
      )}

      <BookingDetailModal
        booking={selected}
        open={!!selected}
        loading={reviewing}
        onClose={() => !reviewing && setSelected(null)}
        onReview={review}
      />
    </AppShell>
  );
}
