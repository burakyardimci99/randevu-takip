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
}

interface ActiveBooking {
  room_id: string;
  end_date: string;
}

export function listRooms(): RoomDto[] {
  const db = getDb();
  const rooms = db
    .prepare(
      `SELECT id, code, name, district, neighborhood, capacity, description, theme
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
      `SELECT id, code, name, district, neighborhood, capacity, description, theme
       FROM rooms WHERE id = ? AND is_active = 1 LIMIT 1`
    )
    .get(id) as RoomRow | undefined;
}
