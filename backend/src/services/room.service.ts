/**
 * Oda servisi: oda listesi ve uygunluk hesaplaması.
 */
import { dbAll, dbOne } from '../db/schema';
// Paylaşılan DTO (backend↔frontend tek kaynak) — #6.
import type { HeatmapCell, HeatmapRoom, RoomHeatmap } from '@klab/shared';

export type { HeatmapCell, HeatmapRoom, RoomHeatmap };

export interface RoomDto {
  id: string;
  code: string;
  name: string;
  district: string;
  neighborhood: string;
  capacity: number;
  description: string | null;
  theme: string;
  /** Resmi cihaz adı — örn. "NVIDIA DGX Spark", "2× MAC STUDIO", "AI Deneyim Alanı". */
  equipment: string;
  /** Oda kategorisi: tekli pod / deneyim alanı / tribün. */
  roomType: 'pod' | 'experience' | 'tribune';
  /** Cihaz teknik özellikleri — JSON dizi [{ label, value }] ya da null. */
  specs: string | null;
  isAvailable: boolean;
  nextAvailableDate: string | null;
}

interface RoomRow {
  id: string;
  code: string;
  name: string;
  district: string;
  neighborhood: string;
  capacity: number;
  description: string | null;
  theme: string;
  equipment: string;
  roomType: 'pod' | 'experience' | 'tribune';
  specs: string | null;
}

interface ActiveBooking {
  room_id: string;
  weekday_mask: number;
  start_date: string;
  end_date: string;
}

const FULL_WEEK_MASK = 127; // Pzt..Paz — tüm günler dolu demek

/** YYYY-MM-DD → ISO haftanın günü (1=Pzt..7=Paz). */
function isoWeekday(dateStr: string): number {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Paz..6=Cmt
  return day === 0 ? 7 : day;
}

/**
 * Oda listesi + uygunluk. `date` verilirse uygunluk O TARİHE göre hesaplanır
 * (o tarihi kapsayan ve o günün maskesi set olan bir booking varsa oda dolu).
 * Verilmezse genel uygunluk (haftanın 7 günü de dolu mu) döner.
 */
export async function listRooms(date?: string): Promise<RoomDto[]> {
  const rooms = await dbAll(`SELECT id, code, name, district, neighborhood, capacity, description, theme, equipment,
              room_type AS roomType, specs
       FROM rooms WHERE is_active = 1 ORDER BY code`, []) as RoomRow[];

  const today = new Date().toISOString().slice(0, 10);

  const activeBookings = await dbAll(`SELECT room_id, weekday_mask, start_date, end_date FROM bookings
       WHERE status IN ('approved', 'pending', 'feedback_requested')
         AND end_date >= ?`, [today]) as ActiveBooking[];

  // Tarih filtresi: belirli bir gün için uygunluk.
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const dayBit = 1 << (isoWeekday(date) - 1);
    const busyOnDate = new Set<string>();
    for (const b of activeBookings) {
      if (b.start_date <= date && date <= b.end_date && (b.weekday_mask & dayBit) !== 0) {
        busyOnDate.add(b.room_id);
      }
    }
    return rooms.map((r) => ({
      ...r,
      isAvailable: !busyOnDate.has(r.id),
      nextAvailableDate: null,
    }));
  }

  // Gün-bazlı doluluk: oda ancak haftanın 7 günü de dolu ise "müsait değil".
  // Kısmi (örn. yalnız Pzt+Çar) booking'lerde oda kalan günler için bookable kalır.
  const occ = new Map<string, { mask: number; maxEnd: string }>();
  for (const b of activeBookings) {
    const cur = occ.get(b.room_id);
    if (!cur) {
      occ.set(b.room_id, { mask: b.weekday_mask, maxEnd: b.end_date });
    } else {
      cur.mask |= b.weekday_mask;
      if (b.end_date > cur.maxEnd) cur.maxEnd = b.end_date;
    }
  }

  return rooms.map((r) => {
    const info = occ.get(r.id);
    const fullyBooked = info ? (info.mask & FULL_WEEK_MASK) === FULL_WEEK_MASK : false;
    return {
      ...r,
      isAvailable: !fullyBooked,
      nextAvailableDate:
        fullyBooked && info
          ? new Date(new Date(info.maxEnd).getTime() + 86400000).toISOString().slice(0, 10)
          : null,
    };
  });
}

export async function getRoomById(id: string): Promise<RoomRow | undefined> {
  return await dbOne(`SELECT id, code, name, district, neighborhood, capacity, description, theme, equipment,
              room_type AS roomType, specs
       FROM rooms WHERE id = ? AND is_active = 1 LIMIT 1`, [id]) as RoomRow | undefined;
}

/* ============================================================
 * ADMIN — odalar + kim hangi odada (doluluk)
 * ============================================================ */

export interface RoomOccupant {
  bookingId: string;
  userId: string;
  userFullName: string;
  userEmail: string;
  projectName: string;
  periodMonths: number;
  startDate: string;
  endDate: string;
  status: 'approved' | 'pending' | 'feedback_requested';
}

export interface RoomWithOccupancy extends RoomDto {
  /** Aktif booking'ler (onaylı + bekleyen), başlangıç tarihine göre sıralı. */
  bookings: RoomOccupant[];
  approvedCount: number;
  pendingCount: number;
}

interface OccupantRow {
  id: string;
  room_id: string;
  user_id: string;
  user_full_name: string;
  user_email: string;
  project_name: string;
  period_months: number;
  start_date: string;
  end_date: string;
  status: 'approved' | 'pending' | 'feedback_requested';
}

/**
 * Admin "Odalar" görünümü — her oda + içindeki aktif booking'ler (kim,
 * hangi proje, hangi tarih, hangi durum). Süresi geçmiş booking'ler hariç.
 */
export async function getRoomsWithOccupancy(): Promise<RoomWithOccupancy[]> {
  const rooms = await listRooms();
  const today = new Date().toISOString().slice(0, 10);

  const rows = await dbAll(`SELECT b.id, b.room_id, b.user_id, b.project_name, b.period_months,
              b.start_date, b.end_date, b.status,
              u.full_name AS user_full_name, u.email AS user_email
       FROM bookings b
       INNER JOIN users u ON u.id = b.user_id
       WHERE b.status IN ('approved', 'pending', 'feedback_requested')
         AND b.end_date >= ?
       ORDER BY b.start_date ASC`, [today]) as OccupantRow[];

  const byRoom = new Map<string, RoomOccupant[]>();
  for (const r of rows) {
    const list = byRoom.get(r.room_id) ?? [];
    list.push({
      bookingId: r.id,
      userId: r.user_id,
      userFullName: r.user_full_name,
      userEmail: r.user_email,
      projectName: r.project_name,
      periodMonths: r.period_months,
      startDate: r.start_date,
      endDate: r.end_date,
      status: r.status,
    });
    byRoom.set(r.room_id, list);
  }

  return rooms.map((room) => {
    const bookings = byRoom.get(room.id) ?? [];
    return {
      ...room,
      bookings,
      approvedCount: bookings.filter((b) => b.status === 'approved').length,
      pendingCount: bookings.filter((b) => b.status !== 'approved').length,
    };
  });
}

/* ============================================================
 * ODA × HAFTANIN GÜNÜ MÜSAİTLİK ISI-HARİTASI (#5c)
 * ============================================================ */

/**
 * Oda × haftanın günü doluluk ısı-haritası. Tarih aralığı [from,to] (varsayılan:
 * bugün..+30g) ile ÖRTÜŞEN aktif booking'ler (pending/approved/feedback_requested),
 * her odanın her günü (weekday_mask biti) için sayılır. Gün-bazlı modelin doğal
 * görselleştirmesi: hangi oda hangi günler yoğun.
 */
export async function getRoomWeekdayHeatmap(opts: { from?: string; to?: string }): Promise<RoomHeatmap> {
  const today = new Date().toISOString().slice(0, 10);
  const valid = (d?: string): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

  const from = valid(opts.from) ? opts.from : today;
  const to = valid(opts.to)
    ? opts.to
    : new Date(new Date(`${from}T00:00:00Z`).getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const rooms = await dbAll(`SELECT id, code, name, theme, room_type AS roomType
       FROM rooms WHERE is_active = 1 ORDER BY code`, []) as Array<{ id: string; code: string; name: string; theme: string; roomType: HeatmapRoom['roomType'] }>;

  // [from,to] ile örtüşen aktif booking'ler (NOT (end < from OR start > to)).
  const bookings = await dbAll(`SELECT room_id, weekday_mask FROM bookings
       WHERE status IN ('approved', 'pending', 'feedback_requested')
         AND NOT (end_date < ? OR start_date > ?)`, [from, to]) as Array<{ room_id: string; weekday_mask: number }>;

  const counts = new Map<string, number[]>();
  for (const b of bookings) {
    let arr = counts.get(b.room_id);
    if (!arr) {
      arr = [0, 0, 0, 0, 0, 0, 0];
      counts.set(b.room_id, arr);
    }
    for (let wd = 1; wd <= 7; wd++) {
      if ((b.weekday_mask & (1 << (wd - 1))) !== 0) arr[wd - 1]++;
    }
  }

  let maxCount = 0;
  const resultRooms: HeatmapRoom[] = rooms.map((r) => {
    const arr = counts.get(r.id) ?? [0, 0, 0, 0, 0, 0, 0];
    const days: HeatmapCell[] = arr.map((count, i) => {
      if (count > maxCount) maxCount = count;
      return { weekday: i + 1, count };
    });
    return {
      roomId: r.id,
      code: r.code,
      name: r.name,
      theme: r.theme,
      roomType: r.roomType,
      days,
      total: arr.reduce((a, c) => a + c, 0),
    };
  });

  return { rooms: resultRooms, from, to, maxCount, weekdays: [1, 2, 3, 4, 5, 6, 7] };
}
