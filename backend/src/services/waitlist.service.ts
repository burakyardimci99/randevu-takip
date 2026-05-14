/**
 * Waitlist (bekleme listesi) servisi.
 *
 * İş kuralı:
 *  - Kullanıcı, dolu (rezerve) bir oda için belirli bir tarih aralığına waitlist'e yazılabilir.
 *  - Her waitlist entry'sinin bir `position` değeri vardır (FIFO).
 *  - Çatışan booking iptal edilirse / dolup serbest kalırsa: head-of-line user otomatik
 *    promote edilir → yeni booking 'pending' status'la oluşur, waitlist entry 'promoted'.
 *  - Aynı user aynı oda + tarih için TEK entry açabilir.
 *  - Geçmiş tarihler hariç (`desired_start_date >= bugün`).
 *
 * Güvenlik:
 *  - IDOR: user_id eşleşmesi zorunlu (kullanıcı sadece kendi entry'sini iptal eder).
 *  - Transaction: position atama + insert tek atomic txn.
 *  - Race condition: room state taşıdığında promote işlemi transaction içinde.
 *
 * Maintenance cron:
 *  - Periyodik (her 30sn) scan: serbest kalan odalar için head'i promote et,
 *    süresi geçmiş entry'ları 'expired' işaretle.
 */
import { nanoid } from 'nanoid';
import { getDb } from '../db/schema';
import { HttpError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { recordAudit } from '../services/audit.service';
import { broadcastBooking, broadcastToAdmins, broadcastToUser } from './sse.service';
import {
  bookingTextForEmbedding,
  saveBookingEmbedding,
} from './embedding.service';
import { enqueueEmail, waitlistPromotedEmail } from './notification.service';

export interface WaitlistEntryDto {
  id: string;
  userId: string;
  userFullName?: string;
  userEmail?: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  periodMonths: number;
  desiredStartDate: string;
  projectName: string;
  projectDescription: string;
  helpNeeded: string;
  technologies: string[];
  position: number;
  status: 'waiting' | 'promoted' | 'expired' | 'cancelled';
  promotedBookingId: string | null;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WaitlistRow {
  id: string;
  user_id: string;
  user_full_name?: string;
  user_email?: string;
  room_id: string;
  room_code?: string;
  room_name?: string;
  period_months: number;
  desired_start_date: string;
  project_name: string;
  project_description: string;
  help_needed: string;
  technologies: string;
  position: number;
  status: 'waiting' | 'promoted' | 'expired' | 'cancelled';
  promoted_booking_id: string | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDto(r: WaitlistRow): WaitlistEntryDto {
  let techs: string[] = [];
  try {
    const t = JSON.parse(r.technologies) as unknown;
    if (Array.isArray(t)) techs = t.filter((x): x is string => typeof x === 'string');
  } catch {
    /* ignore */
  }
  return {
    id: r.id,
    userId: r.user_id,
    userFullName: r.user_full_name,
    userEmail: r.user_email,
    roomId: r.room_id,
    roomCode: r.room_code ?? '',
    roomName: r.room_name ?? '',
    periodMonths: r.period_months,
    desiredStartDate: r.desired_start_date,
    projectName: r.project_name,
    projectDescription: r.project_description,
    helpNeeded: r.help_needed,
    technologies: techs,
    position: r.position,
    status: r.status,
    promotedBookingId: r.promoted_booking_id,
    notifiedAt: r.notified_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function isStartDateValid(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(`${dateStr}T00:00:00`);
  return start.getTime() >= today.getTime();
}

export interface JoinWaitlistInput {
  roomId: string;
  periodMonths: 1 | 2 | 3;
  desiredStartDate: string;
  projectName: string;
  projectDescription: string;
  helpNeeded: string;
  technologies: string[];
}

export function joinWaitlist(userId: string, input: JoinWaitlistInput): WaitlistEntryDto {
  if (!isStartDateValid(input.desiredStartDate)) {
    throw new HttpError(400, 'Başlangıç tarihi bugünden önce olamaz.', 'INVALID_START_DATE');
  }

  const db = getDb();
  const endDate = addMonths(input.desiredStartDate, input.periodMonths);

  const txn = db.transaction(() => {
    // Oda var mı?
    const room = db
      .prepare(`SELECT id FROM rooms WHERE id = ? AND is_active = 1`)
      .get(input.roomId) as { id: string } | undefined;
    if (!room) throw new HttpError(404, 'Oda bulunamadı.', 'ROOM_NOT_FOUND');

    // Aslında oda boşsa waitlist'e değil booking'e gitmeli — kontrol
    const conflict = db
      .prepare(
        `SELECT id FROM bookings
         WHERE room_id = ?
           AND status IN ('pending', 'approved', 'feedback_requested')
           AND NOT (end_date < ? OR start_date > ?)
         LIMIT 1`
      )
      .get(input.roomId, input.desiredStartDate, endDate);
    if (!conflict) {
      throw new HttpError(
        409,
        'Bu oda bu tarihte zaten müsait. Doğrudan randevu oluşturabilirsiniz.',
        'WAITLIST_ROOM_AVAILABLE'
      );
    }

    // Aynı user aynı oda + tarih için zaten waiting/promoted entry var mı?
    const existing = db
      .prepare(
        `SELECT id FROM waitlist
         WHERE user_id = ? AND room_id = ? AND desired_start_date = ?
           AND status IN ('waiting', 'promoted')
         LIMIT 1`
      )
      .get(userId, input.roomId, input.desiredStartDate);
    if (existing) {
      throw new HttpError(
        409,
        'Bu oda ve tarih için zaten waitlist kaydınız var.',
        'WAITLIST_ALREADY_JOINED'
      );
    }

    // Position = mevcut maks + 1 (sadece waiting olanlar arasında)
    const maxRow = db
      .prepare(
        `SELECT COALESCE(MAX(position), 0) AS max_pos
         FROM waitlist WHERE room_id = ? AND status = 'waiting'`
      )
      .get(input.roomId) as { max_pos: number };
    const position = maxRow.max_pos + 1;

    const id = nanoid();
    db.prepare(
      `INSERT INTO waitlist (
         id, user_id, room_id, period_months, desired_start_date,
         project_name, project_description, help_needed, technologies, position, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting')`
    ).run(
      id,
      userId,
      input.roomId,
      input.periodMonths,
      input.desiredStartDate,
      input.projectName,
      input.projectDescription,
      input.helpNeeded,
      JSON.stringify(input.technologies),
      position
    );

    return id;
  });

  const id = txn();
  const entry = getWaitlistEntry(id);
  if (!entry) throw new HttpError(500, 'Waitlist kaydı yazıldı ama okunamadı.', 'INTERNAL');

  recordAudit({
    eventType: 'waitlist.joined',
    subjectId: userId,
    subjectType: 'user',
    success: true,
    details: { waitlistId: id, roomId: input.roomId, position: entry.position },
  });

  broadcastToAdmins({
    type: 'waitlist.changed',
    data: { roomId: input.roomId, action: 'joined' },
  });
  broadcastToUser(userId, {
    type: 'waitlist.changed',
    data: { waitlistId: id, action: 'joined' },
  });

  return entry;
}

export function getWaitlistEntry(id: string): WaitlistEntryDto | undefined {
  const row = getDb()
    .prepare(
      `SELECT w.*, r.code AS room_code, r.name AS room_name,
              u.full_name AS user_full_name, u.email AS user_email
       FROM waitlist w
       INNER JOIN rooms r ON r.id = w.room_id
       INNER JOIN users u ON u.id = w.user_id
       WHERE w.id = ? LIMIT 1`
    )
    .get(id) as WaitlistRow | undefined;
  return row ? rowToDto(row) : undefined;
}

export function listUserWaitlist(userId: string): WaitlistEntryDto[] {
  const rows = getDb()
    .prepare(
      `SELECT w.*, r.code AS room_code, r.name AS room_name,
              u.full_name AS user_full_name, u.email AS user_email
       FROM waitlist w
       INNER JOIN rooms r ON r.id = w.room_id
       INNER JOIN users u ON u.id = w.user_id
       WHERE w.user_id = ?
       ORDER BY w.created_at DESC`
    )
    .all(userId) as WaitlistRow[];
  return rows.map(rowToDto);
}

export function listRoomWaitlist(roomId: string): WaitlistEntryDto[] {
  const rows = getDb()
    .prepare(
      `SELECT w.*, r.code AS room_code, r.name AS room_name,
              u.full_name AS user_full_name, u.email AS user_email
       FROM waitlist w
       INNER JOIN rooms r ON r.id = w.room_id
       INNER JOIN users u ON u.id = w.user_id
       WHERE w.room_id = ? AND w.status = 'waiting'
       ORDER BY w.position ASC`
    )
    .all(roomId) as WaitlistRow[];
  return rows.map(rowToDto);
}

export function listAllWaitlist(): WaitlistEntryDto[] {
  const rows = getDb()
    .prepare(
      `SELECT w.*, r.code AS room_code, r.name AS room_name,
              u.full_name AS user_full_name, u.email AS user_email
       FROM waitlist w
       INNER JOIN rooms r ON r.id = w.room_id
       INNER JOIN users u ON u.id = w.user_id
       ORDER BY w.created_at DESC`
    )
    .all() as WaitlistRow[];
  return rows.map(rowToDto);
}

export function cancelWaitlist(userId: string, waitlistId: string): { cancelled: boolean } {
  const db = getDb();
  const txn = db.transaction(() => {
    const existing = db
      .prepare(`SELECT id, status, room_id FROM waitlist WHERE id = ? AND user_id = ?`)
      .get(waitlistId, userId) as
      | { id: string; status: string; room_id: string }
      | undefined;
    if (!existing) {
      throw new HttpError(404, 'Waitlist kaydı bulunamadı.', 'WAITLIST_ENTRY_NOT_FOUND');
    }
    if (existing.status !== 'waiting') {
      throw new HttpError(
        409,
        'Bu kayıt artık iptal edilemez.',
        'WAITLIST_ENTRY_NOT_FOUND'
      );
    }
    db.prepare(
      `UPDATE waitlist SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(waitlistId);
    return existing.room_id;
  });

  const roomId = txn();

  // Geriye kalanların position'larını yeniden hesapla
  recomputePositions(roomId);

  recordAudit({
    eventType: 'waitlist.left',
    subjectId: userId,
    subjectType: 'user',
    success: true,
    details: { waitlistId },
  });

  broadcastToUser(userId, {
    type: 'waitlist.changed',
    data: { waitlistId, action: 'cancelled' },
  });
  broadcastToAdmins({
    type: 'waitlist.changed',
    data: { roomId, action: 'cancelled' },
  });

  return { cancelled: true };
}

function recomputePositions(roomId: string): void {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id FROM waitlist
       WHERE room_id = ? AND status = 'waiting'
       ORDER BY created_at ASC`
    )
    .all(roomId) as Array<{ id: string }>;
  const txn = db.transaction(() => {
    rows.forEach((row, idx) => {
      db.prepare(`UPDATE waitlist SET position = ? WHERE id = ?`).run(idx + 1, row.id);
    });
  });
  txn();
}

/* ============================================================
 * PROMOTE: serbest kalan oda için head-of-line user'ı booking'e çevir
 * ============================================================ */

/**
 * Belirli bir oda için bekleyenleri kontrol et:
 *  - Her bir waiting entry için: o tarihte oda hala çakışıyor mu?
 *  - Çakışmıyorsa: yeni booking (status='pending') oluştur, entry'yi 'promoted' yap.
 *  - Aynı oda için aynı anda birden fazla entry promote olabilir, çakışmıyorsa.
 */
export async function tryPromoteForRoom(roomId: string): Promise<string[]> {
  const db = getDb();
  const entries = db
    .prepare(
      `SELECT * FROM waitlist
       WHERE room_id = ? AND status = 'waiting'
       ORDER BY position ASC`
    )
    .all(roomId) as WaitlistRow[];

  const promotedIds: string[] = [];

  for (const entry of entries) {
    const endDate = addMonths(entry.desired_start_date, entry.period_months);

    // Tarih geçti mi?
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(`${entry.desired_start_date}T00:00:00`).getTime() < today.getTime()) {
      db.prepare(
        `UPDATE waitlist SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(entry.id);
      continue;
    }

    let newBookingId: string | null = null;
    const txn = db.transaction(() => {
      const conflict = db
        .prepare(
          `SELECT id FROM bookings
           WHERE room_id = ?
             AND status IN ('pending', 'approved', 'feedback_requested')
             AND NOT (end_date < ? OR start_date > ?)
           LIMIT 1`
        )
        .get(roomId, entry.desired_start_date, endDate);
      if (conflict) return null;

      const id = nanoid();
      db.prepare(
        `INSERT INTO bookings (
           id, user_id, room_id, period_months, start_date, end_date,
           project_name, project_description, help_needed, technologies, status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
      ).run(
        id,
        entry.user_id,
        entry.room_id,
        entry.period_months,
        entry.desired_start_date,
        endDate,
        entry.project_name,
        entry.project_description,
        entry.help_needed,
        entry.technologies
      );

      db.prepare(
        `UPDATE waitlist
         SET status = 'promoted', promoted_booking_id = ?, notified_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(id, entry.id);

      return id;
    });

    newBookingId = txn();

    if (newBookingId) {
      promotedIds.push(entry.id);

      // Embedding hesapla (semantic search için)
      try {
        const text = bookingTextForEmbedding({
          projectName: entry.project_name,
          projectDescription: entry.project_description,
          technologies: entry.technologies,
        });
        await saveBookingEmbedding(newBookingId, text);
      } catch (err) {
        logger.warn('waitlist_promote_embedding_failed', {
          bookingId: newBookingId,
          err: (err as Error).message,
        });
      }

      recordAudit({
        eventType: 'waitlist.promoted',
        subjectId: entry.user_id,
        subjectType: 'user',
        success: true,
        details: { waitlistId: entry.id, newBookingId, roomId },
      });

      // E-posta: "Sıranız geldi" bildirimi
      const userRow = db
        .prepare('SELECT email, full_name FROM users WHERE id = ? AND status = 1')
        .get(entry.user_id) as { email: string; full_name: string } | undefined;
      if (userRow?.email) {
        const roomRow = db
          .prepare('SELECT code FROM rooms WHERE id = ?')
          .get(roomId) as { code: string } | undefined;
        void enqueueEmail(
          waitlistPromotedEmail({
            to: userRow.email,
            toName: userRow.full_name,
            projectName: entry.project_name,
            roomCode: roomRow?.code ?? '???',
          })
        );
      }

      broadcastBooking(
        {
          type: 'booking.created',
          data: { bookingId: newBookingId, fromWaitlist: true },
        },
        entry.user_id
      );
      broadcastToUser(entry.user_id, {
        type: 'waitlist.changed',
        data: { waitlistId: entry.id, action: 'promoted', bookingId: newBookingId },
      });
    }
  }

  if (promotedIds.length > 0) {
    recomputePositions(roomId);
  }
  return promotedIds;
}

/**
 * Tüm odalar için promotion + expired temizleme cron.
 * Periyodik çağrılır (server start sırasında setInterval).
 */
let maintenanceTimer: NodeJS.Timeout | null = null;

export function startWaitlistMaintenance(intervalMs = 30_000): void {
  if (maintenanceTimer) return;
  const tick = async () => {
    try {
      const db = getDb();
      const roomsWithWaitlist = db
        .prepare(
          `SELECT DISTINCT room_id FROM waitlist WHERE status = 'waiting'`
        )
        .all() as Array<{ room_id: string }>;
      for (const r of roomsWithWaitlist) {
        await tryPromoteForRoom(r.room_id);
      }
    } catch (err) {
      logger.warn('waitlist_maintenance_error', { err: (err as Error).message });
    }
  };
  maintenanceTimer = setInterval(() => {
    void tick();
  }, intervalMs);
  // Server start'ta hemen bir kez çalıştır
  setTimeout(() => {
    void tick();
  }, 2000);
}

export function stopWaitlistMaintenance(): void {
  if (maintenanceTimer) {
    clearInterval(maintenanceTimer);
    maintenanceTimer = null;
  }
}
