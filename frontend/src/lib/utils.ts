import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type * as React from 'react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Yerel saat diliminde YYYY-MM-DD. toISOString() UTC'ye çevirdiği için
 * TR'de 00:00-03:00 arasında "bugün"ü bir gün geri kaydırıyordu.
 */
export function ymdLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Rezervasyon bitiş tarihi: başlangıç + N ay - 1 gün (backend ile aynı kural).
 * Ay taşmasında hedef ayın son gününe kıskaçlanır (31 Oca + 1 ay = 27 Şub).
 */
export function addMonthsEndDate(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  const startDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDayOfTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(startDay, lastDayOfTarget));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Oda kategorisi etiketi — kapasiteye duyarlı. Pod'lar tek/iki kişilik olabildiği
 * için yalnız roomType yetmiyordu ("Tekli Pod" filtresi 2 kişilikleri de getiriyordu).
 */
export function roomCategoryLabel(roomType: 'pod' | 'experience' | 'tribune', capacity: number): string {
  if (roomType === 'experience') return 'Deneyim Alanı';
  if (roomType === 'tribune') return 'Tribün';
  return capacity <= 1 ? 'Tekli Pod' : 'İkili Pod';
}

/** Oda kategori filtre anahtarı — pod'u kapasiteye göre tekli/ikili ayırır. */
export function roomCategoryKey(
  roomType: 'pod' | 'experience' | 'tribune',
  capacity: number
): 'pod1' | 'pod2' | 'experience' | 'tribune' {
  if (roomType === 'pod') return capacity <= 1 ? 'pod1' : 'pod2';
  return roomType;
}

/**
 * Date input'larda takvimin yalnız ikon tıklamasıyla değil, alanın tamamına
 * tıklayınca açılması için onClick handler'ı (tarayıcı destekliyorsa).
 */
export function openDatePicker(e: React.MouseEvent<HTMLInputElement>): void {
  const el = e.currentTarget;
  try {
    el.showPicker?.();
  } catch {
    // Bazı tarayıcılar kullanıcı hareketi dışında izin vermez — sessizce geç.
  }
}
