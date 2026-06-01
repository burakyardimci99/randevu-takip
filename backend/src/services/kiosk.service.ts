/**
 * Kiosk servisi (#5b) — oda ekranı görünümü.
 *
 * Bir odanın SON üretilen (ready) görselini döner; kiosk ekranı tam ekran
 * gösterir + auto-refresh + idle screen. 20 odaya bağlı.
 *
 * Privacy: kiosk PUBLIC (oda ekranı, login yok). Yalnız görsel URL'i (prompt'suz
 * iç URL — #1) + zaman damgası + oda bilgisi döner. Kullanıcı/fikir/tema İFŞA
 * EDİLMEZ (banka veri-yönetişimi).
 */
import { getDb } from '../db/schema';

export interface KioskRoom {
  id: string;
  code: string;
  name: string;
  theme: string;
  equipment: string;
  roomType: 'pod' | 'experience' | 'tribune';
}

export interface KioskData {
  room: KioskRoom;
  latestVisual: { imageUrl: string; createdAt: string } | null;
}

/** Kiosk seçici için aktif odaların minimal listesi (PII yok). */
export function listKioskRooms(): KioskRoom[] {
  return getDb()
    .prepare(
      `SELECT id, code, name, theme, equipment, room_type AS roomType
       FROM rooms WHERE is_active = 1 ORDER BY code`
    )
    .all() as KioskRoom[];
}

/** Bir odanın kiosk verisi: oda + son hazır görsel (yoksa null → idle screen). */
export function getRoomKiosk(roomId: string): KioskData | null {
  const db = getDb();
  const room = db
    .prepare(
      `SELECT id, code, name, theme, equipment, room_type AS roomType
       FROM rooms WHERE id = ? AND is_active = 1 LIMIT 1`
    )
    .get(roomId) as KioskRoom | undefined;
  if (!room) return null;

  // Bu odaya bağlı en son 'ready' görsel (image_url dolu). Yalnız URL + zaman.
  const visual = db
    .prepare(
      `SELECT image_url, updated_at
       FROM visuals
       WHERE room_id = ? AND status = 'ready' AND image_url IS NOT NULL
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .get(roomId) as { image_url: string; updated_at: string } | undefined;

  return {
    room,
    latestVisual: visual ? { imageUrl: visual.image_url, createdAt: visual.updated_at } : null,
  };
}
