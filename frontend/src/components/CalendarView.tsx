/**
 * Custom month-view calendar — external dependency yok.
 *
 * Özellikler:
 *  - Ay navigasyon (önceki/sonraki/bugün).
 *  - Booking event'leri günlere yerleştirilir (multi-day span görselleştirilir).
 *  - Status'a göre renk: pending=amber, approved=emerald, feedback=blue, rejected=red.
 *  - Click → onBookingClick callback.
 *  - Tarih hücresine click → onDateClick (yeni booking için kullanılabilir).
 *
 * Erişilebilirlik: ARIA label, klavye odaklanabilirlik (tabIndex).
 */
import { useMemo, useState } from 'react';
import type { Booking, BookingStatus } from '../types';

const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

function statusColor(status: BookingStatus): { bg: string; text: string; dot: string } {
  switch (status) {
    case 'approved':
      return { bg: 'bg-emerald-100 hover:bg-emerald-200', text: 'text-emerald-900', dot: 'bg-emerald-500' };
    case 'pending':
      return { bg: 'bg-amber-100 hover:bg-amber-200', text: 'text-amber-900', dot: 'bg-amber-500' };
    case 'feedback_requested':
      return { bg: 'bg-blue-100 hover:bg-blue-200', text: 'text-blue-900', dot: 'bg-blue-500' };
    case 'rejected':
      return { bg: 'bg-rose-100 hover:bg-rose-200', text: 'text-rose-900', dot: 'bg-rose-500' };
  }
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map((p) => parseInt(p, 10));
  return new Date(y, m - 1, d);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

interface CalendarViewProps {
  bookings: Booking[];
  /** Click on a booking event (chip). */
  onBookingClick?: (booking: Booking) => void;
  /** Click on an empty day cell. */
  onDateClick?: (date: string) => void;
  /** Initial month — defaults to today. */
  initialMonth?: Date;
}

export function CalendarView({
  bookings,
  onBookingClick,
  onDateClick,
  initialMonth,
}: CalendarViewProps) {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(initialMonth ?? new Date()));

  const month = cursor.getMonth();
  const year = cursor.getFullYear();

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    // Türkiye haftası Pazartesi başlangıç (1) — JS getDay() Pazar=0
    const firstDow = (first.getDay() + 6) % 7; // 0=Pzt
    const daysInMonth = last.getDate();

    const cells: Array<{
      date: Date;
      iso: string;
      inMonth: boolean;
    }> = [];

    // Önceki ay padding
    for (let i = firstDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      cells.push({ date: d, iso: ymd(d), inMonth: false });
    }
    // Bu ay
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      cells.push({ date: d, iso: ymd(d), inMonth: true });
    }
    // Sonraki ay padding — toplam 42 hücreye tamamla
    while (cells.length < 42) {
      const last = cells[cells.length - 1].date;
      const next = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
      cells.push({ date: next, iso: ymd(next), inMonth: false });
    }
    return cells;
  }, [year, month]);

  // Booking'leri her hücreye yerleştirme: hücre tarihi start..end aralığında ise dahil
  const bookingsByDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
      const start = parseLocalDate(b.startDate);
      const end = parseLocalDate(b.endDate);
      const cur = new Date(start);
      while (cur.getTime() <= end.getTime()) {
        const key = ymd(cur);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(b);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [bookings]);

  const today = ymd(new Date());

  const prev = () => setCursor(new Date(year, month - 1, 1));
  const next = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => setCursor(startOfMonth(new Date()));

  return (
    <div className="bg-white rounded-2xl border border-kt-gray-100 shadow-kt-soft p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-bold text-kt-green-900">
            {MONTHS[month]} {year}
          </h3>
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-kt-gray-100 hover:bg-kt-gray-200 text-kt-green-800 transition-colors"
          >
            Bugün
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={prev}
            aria-label="Önceki ay"
            className="p-2 rounded-lg hover:bg-kt-gray-100 text-kt-green-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={next}
            aria-label="Sonraki ay"
            className="p-2 rounded-lg hover:bg-kt-gray-100 text-kt-green-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS_SHORT.map((d) => (
          <div
            key={d}
            className="text-center text-[11px] font-bold uppercase tracking-wider text-kt-gray-400 py-1.5"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const dayBookings = bookingsByDate.get(cell.iso) ?? [];
          const isToday = cell.iso === today;
          // Hücrenin kendisi <div> (clickable area), içeride <button>'lar event chip'leri.
          return (
            <div
              key={cell.iso}
              role="button"
              tabIndex={cell.inMonth ? 0 : -1}
              onClick={() => onDateClick?.(cell.iso)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onDateClick?.(cell.iso);
                }
              }}
              className={`group relative min-h-[88px] p-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                cell.inMonth
                  ? 'bg-white border-kt-gray-100 hover:border-kt-gold-300'
                  : 'bg-kt-gray-50/60 border-transparent text-kt-gray-300'
              } ${isToday ? 'ring-2 ring-kt-gold-400 ring-inset' : ''}`}
            >
              <div
                className={`text-[11px] font-bold mb-0.5 ${
                  isToday
                    ? 'text-kt-gold-700'
                    : cell.inMonth
                    ? 'text-kt-green-900'
                    : 'text-kt-gray-300'
                }`}
              >
                {cell.date.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayBookings.slice(0, 3).map((b) => {
                  const c = statusColor(b.status);
                  return (
                    <button
                      key={`${b.id}-${cell.iso}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBookingClick?.(b);
                      }}
                      className={`w-full ${c.bg} ${c.text} rounded px-1.5 py-0.5 text-[10px] font-semibold truncate text-left flex items-center gap-1`}
                      title={`${b.roomCode} · ${b.projectName} · ${b.userFullName ?? ''}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0`} />
                      <span className="truncate">
                        {b.roomCode} · {b.projectName}
                      </span>
                    </button>
                  );
                })}
                {dayBookings.length > 3 && (
                  <div className="text-[10px] text-kt-gray-500 font-medium px-1.5">
                    +{dayBookings.length - 3} daha
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-kt-gray-100 flex items-center gap-4 flex-wrap text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-kt-gray-600">Bekleyen</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-kt-gray-600">Onaylı</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-kt-gray-600">Düzeltme</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          <span className="text-kt-gray-600">Reddedilen</span>
        </div>
      </div>
    </div>
  );
}
