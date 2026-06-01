/**
 * Randevu (appointment) servisi.
 *
 * Konsept:
 *  - Booking = "lab kullanım lisansı" (1-3 ay süreyle proje için onaylanmış oda).
 *  - Appointment = booking'in tarih aralığı içinde kullanıcının odaya geleceği
 *    belirli gün ve saat aralığı. Kullanıcı kendi takviminde planlama yapar.
 *
 * Kurallar (oluşturma + güncelleme sırasında transaction içinde doğrulanır):
 *  1. Booking onaylanmış (`status='approved'`) olmalı ve `user_id` çağıran user
 *     olmalı (IDOR koruması — app_security.md §5).
 *  2. `start_at < end_at`, en az 15 dk, en fazla 12 saat sürebilir.
 *  3. `start_at` ve `end_at`, booking'in `start_date..end_date` aralığı içinde
 *     kalmalı (lisans süresi dışında ziyaret yok).
 *  4. Kullanıcı kendi başka bir randevusu ile çakışamaz (aynı kullanıcı eş zamanlı
 *     iki yerde olamaz — UX guard).
 *  5. Oda kapasitesi: aynı zaman diliminde scheduled appointment sayısı
 *     `rooms.capacity`'i aşamaz. Race condition'a karşı SQLite txn içinde kontrol.
 *
 * Güvenlik:
 *  - SQL prepared statements (data_security.md §1).
 *  - Audit event: 'appointment.created' / 'appointment.cancelled'.
 *  - SSE: kullanıcı + admin kanalına yayın.
 */
import { nanoid } from 'nanoid';
import { dbAll, dbOne, dbRun, dbTx, getDb } from '../db/schema';
import { HttpError } from '../middleware/error.middleware';
import { recordAudit } from './audit.service';
import { broadcastBooking, broadcastToAdmins } from './sse.service';

export type AppointmentStatus = 'scheduled' | 'cancelled' | 'completed';

export interface AppointmentDto {
  id: string;
  bookingId: string;
  userId: string;
  userFullName?: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  roomEquipment: string;
  startAt: string;
  endAt: string;
  title: string;
  notes: string;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
}

interface AppointmentRow {
  id: string;
  booking_id: string;
  user_id: string;
  user_full_name?: string;
  room_id: string;
  room_code: string;
  room_name: string;
  room_equipment: string;
  start_at: string;
  end_at: string;
  title: string;
  notes: string;
  status: AppointmentStatus;
  created_at: string;
  updated_at: string;
}

function rowToDto(r: AppointmentRow): AppointmentDto {
  return {
    id: r.id,
    bookingId: r.booking_id,
    userId: r.user_id,
    userFullName: r.user_full_name,
    roomId: r.room_id,
    roomCode: r.room_code,
    roomName: r.room_name,
    roomEquipment: r.room_equipment,
    startAt: r.start_at,
    endAt: r.end_at,
    title: r.title,
    notes: r.notes,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const MIN_DURATION_MIN = 15;
const MAX_DURATION_HOUR = 12;

/** ISO 8601 datetime string'i Date'e parse et — hata durumunda undefined. */
function parseIso(s: string): Date | undefined {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** YYYY-MM-DD → günün başlangıcı (local). */
function dayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

/** YYYY-MM-DD → günün sonu (local 23:59:59.999). */
function dayEnd(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999`);
}

interface CreateAppointmentInput {
  bookingId: string;
  startAt: string;
  endAt: string;
  title?: string;
  notes?: string;
}

/**
 * Yeni randevu oluştur. Tüm doğrulamalar SQLite transaction içinde yapılır,
 * race condition'a karşı kapasite + çakışma kontrolleri atomik.
 */
export async function createAppointment(
  userId: string,
  input: CreateAppointmentInput
): Promise<AppointmentDto> {
  const start = parseIso(input.startAt);
  const end = parseIso(input.endAt);
  if (!start || !end) {
    throw new HttpError(400, 'Geçersiz tarih/saat.', 'INVALID_DATETIME');
  }
  if (start.getTime() >= end.getTime()) {
    throw new HttpError(400, 'Bitiş zamanı başlangıçtan sonra olmalı.', 'INVALID_RANGE');
  }
  const durationMin = (end.getTime() - start.getTime()) / 60000;
  if (durationMin < MIN_DURATION_MIN) {
    throw new HttpError(
      400,
      `Randevu en az ${MIN_DURATION_MIN} dakika olmalı.`,
      'TOO_SHORT'
    );
  }
  if (durationMin > MAX_DURATION_HOUR * 60) {
    throw new HttpError(
      400,
      `Randevu en fazla ${MAX_DURATION_HOUR} saat olabilir.`,
      'TOO_LONG'
    );
  }
  // Geçmişe randevu alınamaz (5 dk tolerans — UI gecikmesi).
  if (start.getTime() < Date.now() - 5 * 60 * 1000) {
    throw new HttpError(400, 'Geçmiş bir tarih için randevu alınamaz.', 'PAST_DATE');
  }


  const id = nanoid();
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const title = (input.title ?? '').trim().slice(0, 120);
  const notes = (input.notes ?? '').trim().slice(0, 500);

  const roomId = await dbTx(async () => {
    // 1. Booking ownership + onay durumu
    const booking = await dbOne(`SELECT id, user_id, room_id, status, start_date, end_date, project_name
         FROM bookings WHERE id = ?`, [input.bookingId]) as
      | {
          id: string;
          user_id: string;
          room_id: string;
          status: string;
          start_date: string;
          end_date: string;
          project_name: string;
        }
      | undefined;

    if (!booking) {
      throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
    }
    if (booking.user_id !== userId) {
      throw new HttpError(
        403,
        'Bu booking size ait değil.',
        'BOOKING_NOT_OWNED'
      );
    }
    if (booking.status !== 'approved') {
      throw new HttpError(
        409,
        'Sadece onaylanmış booking üzerine randevu eklenebilir.',
        'BOOKING_NOT_APPROVED'
      );
    }

    // 2. Booking tarih aralığı içinde
    const bookingStart = dayStart(booking.start_date);
    const bookingEnd = dayEnd(booking.end_date);
    if (start.getTime() < bookingStart.getTime() || end.getTime() > bookingEnd.getTime()) {
      throw new HttpError(
        400,
        `Randevu booking aralığı (${booking.start_date} – ${booking.end_date}) içinde olmalı.`,
        'OUT_OF_BOOKING_RANGE'
      );
    }

    // 3. Kullanıcının kendi başka bir randevusu ile çakışıyor mu?
    const ownConflict = await dbOne(`SELECT id FROM appointments
         WHERE user_id = ? AND status = 'scheduled'
           AND NOT (end_at <= ? OR start_at >= ?)
         LIMIT 1`, [userId, startIso, endIso]);
    if (ownConflict) {
      throw new HttpError(
        409,
        'Aynı saat dilimi için zaten bir randevunuz var.',
        'USER_OVERLAP'
      );
    }

    // 4. Oda kapasitesi — eş zamanlı scheduled appointment sayısı + 1 ≤ capacity
    const room = await dbOne(`SELECT capacity FROM rooms WHERE id = ?`, [booking.room_id]) as { capacity: number } | undefined;
    const capacity = room?.capacity ?? 1;

    const overlapCount = await dbOne(`SELECT COUNT(*) AS c FROM appointments
         WHERE room_id = ? AND status = 'scheduled'
           AND NOT (end_at <= ? OR start_at >= ?)`, [booking.room_id, startIso, endIso]) as { c: number };
    if (overlapCount.c >= capacity) {
      throw new HttpError(
        409,
        `Oda bu saat aralığında dolu (kapasite ${capacity}).`,
        'ROOM_FULL'
      );
    }

    // 5. INSERT
    await dbRun(`INSERT INTO appointments (
         id, booking_id, user_id, room_id, start_at, end_at, title, notes, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`, [id,
      booking.id,
      userId,
      booking.room_id,
      startIso,
      endIso,
      title || booking.project_name,
      notes]);

    return booking.room_id;
  });

  recordAudit({
    eventType: 'appointment.created',
    subjectId: userId,
    subjectType: 'user',
    success: true,
    details: { appointmentId: id, bookingId: input.bookingId, roomId, startAt: startIso, endAt: endIso },
  });

  const created = await getAppointmentById(id, userId, true) as AppointmentDto;

  broadcastBooking(
    { type: 'appointment.changed', data: { appointmentId: id, action: 'created' } },
    userId
  );
  broadcastToAdmins({
    type: 'appointment.changed',
    data: { appointmentId: id, action: 'created', userId, roomId },
  });

  return created;
}

/**
 * Randevu iptal et — kullanıcı kendi randevusunu iptal edebilir; admin için
 * isOwnerCheck=false ile çağrılır.
 */
export async function cancelAppointment(
  callerId: string,
  appointmentId: string,
  options: { ownerCheck: boolean; callerType: 'user' | 'admin' } = {
    ownerCheck: true,
    callerType: 'user',
  }
): Promise<{ cancelled: boolean }> {

  const existing = await dbTx(async () => {
    const existing = await dbOne(`SELECT id, user_id, room_id, status FROM appointments WHERE id = ?`, [appointmentId]) as
      | { id: string; user_id: string; room_id: string; status: string }
      | undefined;
    if (!existing) {
      throw new HttpError(404, 'Randevu bulunamadı.', 'APPOINTMENT_NOT_FOUND');
    }
    if (options.ownerCheck && existing.user_id !== callerId) {
      throw new HttpError(403, 'Bu randevu size ait değil.', 'NOT_OWNED');
    }
    if (existing.status !== 'scheduled') {
      throw new HttpError(
        409,
        'Sadece planlı randevu iptal edilebilir.',
        'NOT_CANCELLABLE'
      );
    }
    await dbRun(`UPDATE appointments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [appointmentId]);

    return existing;
  });

  recordAudit({
    eventType: 'appointment.cancelled',
    subjectId: callerId,
    subjectType: options.callerType,
    success: true,
    details: { appointmentId, userId: existing.user_id, roomId: existing.room_id },
  });

  broadcastBooking(
    { type: 'appointment.changed', data: { appointmentId, action: 'cancelled' } },
    existing.user_id
  );
  broadcastToAdmins({
    type: 'appointment.changed',
    data: { appointmentId, action: 'cancelled', userId: existing.user_id, roomId: existing.room_id },
  });

  return { cancelled: true };
}

const SELECT_COLS = `
  a.id, a.booking_id, a.user_id, a.room_id, a.start_at, a.end_at,
  a.title, a.notes, a.status, a.created_at, a.updated_at,
  r.code AS room_code, r.name AS room_name, r.equipment AS room_equipment,
  u.full_name AS user_full_name
`;

const BASE_JOIN = `
  FROM appointments a
  INNER JOIN rooms r ON r.id = a.room_id
  INNER JOIN users u ON u.id = a.user_id
`;

/**
 * Kullanıcının kendi randevuları (default: scheduled). `includeCancelled` ile
 * iptaller dahil edilir (geçmiş takvim sayfası).
 */
export async function listUserAppointments(
  userId: string,
  options: { from?: string; to?: string; includeCancelled?: boolean } = {}
): Promise<AppointmentDto[]> {
  const where: string[] = ['a.user_id = ?'];
  const params: unknown[] = [userId];

  if (!options.includeCancelled) {
    where.push("a.status = 'scheduled'");
  }
  if (options.from) {
    where.push('a.end_at >= ?');
    params.push(options.from);
  }
  if (options.to) {
    where.push('a.start_at <= ?');
    params.push(options.to);
  }

  const rows = await dbAll(`SELECT ${SELECT_COLS} ${BASE_JOIN}
       WHERE ${where.join(' AND ')}
       ORDER BY a.start_at ASC`, [...params]) as AppointmentRow[];

  return rows.map(rowToDto);
}

/**
 * Bir booking'in tüm randevuları (sahibi veya admin görür).
 */
export async function listBookingAppointments(
  bookingId: string,
  options: { includeCancelled?: boolean } = {}
): Promise<AppointmentDto[]> {
  const statusFilter = options.includeCancelled ? '' : "AND a.status = 'scheduled'";
  const rows = await dbAll(`SELECT ${SELECT_COLS} ${BASE_JOIN}
       WHERE a.booking_id = ? ${statusFilter}
       ORDER BY a.start_at ASC`, [bookingId]) as AppointmentRow[];
  return rows.map(rowToDto);
}

/**
 * Bir odanın belirli tarih aralığındaki tüm scheduled randevuları (oda takvimi
 * için — kim ne zaman gelecek görünür).
 */
export async function listRoomAppointments(
  roomId: string,
  from: string,
  to: string
): Promise<AppointmentDto[]> {
  const rows = await dbAll(`SELECT ${SELECT_COLS} ${BASE_JOIN}
       WHERE a.room_id = ?
         AND a.status = 'scheduled'
         AND a.end_at >= ?
         AND a.start_at <= ?
       ORDER BY a.start_at ASC`, [roomId, from, to]) as AppointmentRow[];
  return rows.map(rowToDto);
}

/**
 * Tek randevu çek — owner check ile.
 */
export async function getAppointmentById(
  id: string,
  callerId: string,
  isAdmin = false
): Promise<AppointmentDto | undefined> {
  const row = await dbOne(`SELECT ${SELECT_COLS} ${BASE_JOIN} WHERE a.id = ? LIMIT 1`, [id]) as AppointmentRow | undefined;
  if (!row) return undefined;
  if (!isAdmin && row.user_id !== callerId) return undefined;
  return rowToDto(row);
}

/**
 * Admin: tüm randevular (yönetim takvimi).
 */
export async function listAllAppointments(
  filters: { from?: string; to?: string; includeCancelled?: boolean } = {}
): Promise<AppointmentDto[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!filters.includeCancelled) where.push("a.status = 'scheduled'");
  if (filters.from) {
    where.push('a.end_at >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    where.push('a.start_at <= ?');
    params.push(filters.to);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await dbAll(`SELECT ${SELECT_COLS} ${BASE_JOIN}
       ${whereSql}
       ORDER BY a.start_at ASC`, [...params]) as AppointmentRow[];
  return rows.map(rowToDto);
}
