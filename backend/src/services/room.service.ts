/**
 * Oda servisi: oda listesi ve uygunluk hesaplaması.
 */
import { getDb } from '../db/schema';

export interface RoomDto {
  id: string;
  code: string;
  name: string;
  district: string;
  neighborhood: string;
  capacity: number;
  description: string | null;
  theme: string;
  /** Resmi cihaz adı — örn. "NVIDIA DGX SPARK", "2x MAC STUDIO", "AI Deneyim Alanı". */
  equipment: string;
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
}

interface ActiveBooking {
  room_id: string;
  end_date: string;
}

export function listRooms(): RoomDto[] {
  const db = getDb();
  const rooms = db
    .prepare(
      `SELECT id, code, name, district, neighborhood, capacity, description, theme, equipment
       FROM rooms WHERE is_active = 1 ORDER BY code`
    )
    .all() as RoomRow[];

  const today = new Date().toISOString().slice(0, 10);

  const activeBookings = db
    .prepare(
      `SELECT room_id, end_date FROM bookings
       WHERE status IN ('approved', 'pending', 'feedback_requested')
         AND end_date >= ?`
    )
    .all(today) as ActiveBooking[];

  const busyMap = new Map<string, string>();
  for (const b of activeBookings) {
    const existing = busyMap.get(b.room_id);
    if (!existing || b.end_date > existing) {
      busyMap.set(b.room_id, b.end_date);
    }
  }

  return rooms.map((r) => {
    const busyUntil = busyMap.get(r.id) ?? null;
    return {
      ...r,
      isAvailable: !busyUntil,
      nextAvailableDate: busyUntil
        ? new Date(new Date(busyUntil).getTime() + 86400000).toISOString().slice(0, 10)
        : null,
    };
  });
}

export function getRoomById(id: string): RoomRow | undefined {
  return getDb()
    .prepare(
      `SELECT id, code, name, district, neighborhood, capacity, description, theme, equipment
       FROM rooms WHERE id = ? AND is_active = 1 LIMIT 1`
    )
    .get(id) as RoomRow | undefined;
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
export function getRoomsWithOccupancy(): RoomWithOccupancy[] {
  const db = getDb();
  const rooms = listRooms();
  const today = new Date().toISOString().slice(0, 10);

  const rows = db
    .prepare(
      `SELECT b.id, b.room_id, b.user_id, b.project_name, b.period_months,
              b.start_date, b.end_date, b.status,
              u.full_name AS user_full_name, u.email AS user_email
       FROM bookings b
       INNER JOIN users u ON u.id = b.user_id
       WHERE b.status IN ('approved', 'pending', 'feedback_requested')
         AND b.end_date >= ?
       ORDER BY b.start_date ASC`
    )
    .all(today) as OccupantRow[];

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
