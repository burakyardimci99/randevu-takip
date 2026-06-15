/**
 * Tarih yardımcıları — saat dilimi politikası.
 *
 * Sistem TR sahası için çalışır; "bugün" ve tarih sınırı hesapları process'in
 * yerel saat dilimine (TZ=Europe/Istanbul — config/env.ts'te garanti edilir)
 * göre yapılmalı. `new Date().toISOString()` HER ZAMAN UTC döndürür ve TR'de
 * 00:00-03:00 arasında bir önceki günü üretir — "bugün" için kullanılmamalı.
 */

/** Yerel saat dilimine göre YYYY-MM-DD. */
export function ymdLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Rezervasyon bitiş tarihi: başlangıç + N ay - 1 gün.
 * Ay taşmasında hedef ayın son gününe kıskaçlanır (31 Oca + 1 ay = 27 Şub;
 * JS'in taşma davranışıyla Mart'a kaymaz). Saf tarih aritmetiği — UTC çıpalı
 * çalışır, saat diliminden bağımsızdır.
 */
export function addMonthsEndDate(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const startDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDayOfTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(startDay, lastDayOfTarget));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
