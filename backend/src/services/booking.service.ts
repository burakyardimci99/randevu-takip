/**
 * Booking servisi.
 *
 * Güvenlik:
 * - app_security.md §10: Race condition için transaction içinde uygunluk kontrolü.
 * - app_security.md §5 (IDOR): User'lar yalnızca kendi booking'lerini görür.
 * - app_security.md §3: Tüm input zod ile doğrulanır, sorgular parameterized.
 */
import { nanoid } from 'nanoid';
import { getDb } from '../db/schema';
import { HttpError } from '../middleware/error.middleware';
import type { CreateBookingInput, ReviewBookingInput } from '../validators/schemas';
import {
  bookingTextForEmbedding,
  deleteBookingEmbedding,
  saveBookingEmbedding,
} from './embedding.service';
import { broadcastBooking, broadcastToAdmins } from './sse.service';
import {
  bookingCreatedAdminEmail,
  bookingReviewedEmail,
  enqueueEmail,
} from './notification.service';
import { logger } from '../utils/logger';

export interface BookingDto {
  id: string;
  userId: string;
  userEmail?: string;
  userFullName?: string;
  roomId: string;
  roomName: string;
  roomCode: string;
  periodMonths: number;
  startDate: string;
  endDate: string;
  projectName: string;
  projectDescription: string;
  helpNeeded: string;
  technologies: string[];
  status: 'pending' | 'approved' | 'rejected' | 'feedback_requested';
  adminFeedback: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BookingRow {
  id: string;
  user_id: string;
  user_email?: string;
  user_full_name?: string;
  room_id: string;
  room_name: string;
  room_code: string;
  period_months: number;
  start_date: string;
  end_date: string;
  project_name: string;
  project_description: string;
  help_needed: string;
  technologies: string;
  status: 'pending' | 'approved' | 'rejected' | 'feedback_requested';
  admin_feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToDto(r: BookingRow): BookingDto {
  let techs: string[] = [];
  try {
    const parsed = JSON.parse(r.technologies) as unknown;
    if (Array.isArray(parsed)) techs = parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    techs = [];
  }
  return {
    id: r.id,
    userId: r.user_id,
    userEmail: r.user_email,
    userFullName: r.user_full_name,
    roomId: r.room_id,
    roomName: r.room_name,
    roomCode: r.room_code,
    periodMonths: r.period_months,
    startDate: r.start_date,
    endDate: r.end_date,
    projectName: r.project_name,
    projectDescription: r.project_description,
    helpNeeded: r.help_needed,
    technologies: techs,
    status: r.status,
    adminFeedback: r.admin_feedback,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
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

function isValidStartDate(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(`${dateStr}T00:00:00`);
  return start.getTime() >= today.getTime();
}

export function createBooking(userId: string, input: CreateBookingInput): BookingDto {
  if (!isValidStartDate(input.startDate)) {
    throw new HttpError(400, 'Başlangıç tarihi bugünden önce olamaz.', 'INVALID_START_DATE');
  }

  const endDate = addMonths(input.startDate, input.periodMonths);
  const db = getDb();

  const txn = db.transaction(() => {
    const room = db
      .prepare(`SELECT id, code, name FROM rooms WHERE id = ? AND is_active = 1`)
      .get(input.roomId) as { id: string; code: string; name: string } | undefined;

    if (!room) {
      throw new HttpError(404, 'Oda bulunamadı.', 'ROOM_NOT_FOUND');
    }

    const conflict = db
      .prepare(
        `SELECT id FROM bookings
         WHERE room_id = ?
           AND status IN ('pending', 'approved', 'feedback_requested')
           AND NOT (end_date < ? OR start_date > ?)
         LIMIT 1`
      )
      .get(input.roomId, input.startDate, endDate);

    if (conflict) {
      throw new HttpError(409, 'Bu tarih aralığında oda müsait değil.', 'ROOM_NOT_AVAILABLE');
    }

    const id = nanoid();
    db.prepare(
      `INSERT INTO bookings (
        id, user_id, room_id, period_months, start_date, end_date,
        project_name, project_description, help_needed, technologies, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(
      id,
      userId,
      input.roomId,
      input.periodMonths,
      input.startDate,
      endDate,
      input.projectName,
      input.projectDescription,
      input.helpNeeded,
      JSON.stringify(input.technologies)
    );

    return id;
  });

  const bookingId = txn();
  const created = getBookingByIdForUser(userId, bookingId) as BookingDto;

  // Embedding hesapla (fire-and-forget — response'u bekletme)
  const embText = bookingTextForEmbedding({
    projectName: created.projectName,
    projectDescription: created.projectDescription,
    technologies: created.technologies,
  });
  saveBookingEmbedding(bookingId, embText).catch((err) =>
    logger.warn('embedding_create_failed', { bookingId, err: (err as Error).message })
  );

  // SSE event
  broadcastBooking(
    { type: 'booking.created', data: { bookingId, status: created.status } },
    userId
  );

  // E-posta: admin'lere yeni talep bildirimi
  const admins = getDb()
    .prepare("SELECT email FROM admins WHERE status = 1")
    .all() as Array<{ email: string }>;
  for (const a of admins) {
    void enqueueEmail(
      bookingCreatedAdminEmail({
        to: a.email,
        projectName: created.projectName,
        roomCode: created.roomCode,
        submitterName: created.userFullName ?? 'Bir kullanıcı',
      })
    );
  }

  return created;
}

/**
 * Kullanıcının kendi booking'ini düzenler.
 *
 * Güvenlik:
 * - IDOR koruması: user_id + booking_id eşleşmesi zorunlu (app_security §5)
 * - Status kısıtı: sadece 'pending' veya 'feedback_requested' düzenlenebilir.
 *   Admin onayı verilmiş (approved) veya reddedilmiş (rejected) booking değişmez.
 * - Düzenleme sonrası status → 'pending' (admin tekrar incelesin)
 * - Transaction içinde uygunluk yeniden kontrol edilir (race condition koruması, §10)
 */
export function updateBooking(
  userId: string,
  bookingId: string,
  input: CreateBookingInput
): BookingDto {
  const endDate = addMonths(input.startDate, input.periodMonths);
  const db = getDb();

  const txn = db.transaction(() => {
    // 1) Booking varlığı + sahiplik + status kontrolü
    const existing = db
      .prepare(
        `SELECT id, status, room_id, user_id
         FROM bookings WHERE id = ? AND user_id = ?`
      )
      .get(bookingId, userId) as
      | { id: string; status: string; room_id: string; user_id: string }
      | undefined;

    if (!existing) {
      throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
    }
    if (existing.status !== 'pending' && existing.status !== 'feedback_requested') {
      throw new HttpError(
        409,
        'Bu durumdaki bir talep düzenlenemez. Sadece beklemede veya düzeltme talep edilen istekler düzenlenebilir.',
        'BOOKING_NOT_EDITABLE'
      );
    }

    // 2) Oda var mı?
    const room = db
      .prepare(`SELECT id FROM rooms WHERE id = ? AND is_active = 1`)
      .get(input.roomId) as { id: string } | undefined;
    if (!room) throw new HttpError(404, 'Oda bulunamadı.', 'ROOM_NOT_FOUND');

    // 3) Tarih çakışması — kendi booking'i hariç tut
    const conflict = db
      .prepare(
        `SELECT id FROM bookings
         WHERE room_id = ?
           AND id != ?
           AND status IN ('pending', 'approved', 'feedback_requested')
           AND NOT (end_date < ? OR start_date > ?)
         LIMIT 1`
      )
      .get(input.roomId, bookingId, input.startDate, endDate);
    if (conflict) {
      throw new HttpError(409, 'Bu tarih aralığında oda müsait değil.', 'ROOM_NOT_AVAILABLE');
    }

    // 4) Güncelle: düzenleme sonrası admin tekrar incelesin → status='pending'
    db.prepare(
      `UPDATE bookings
       SET room_id = ?, period_months = ?, start_date = ?, end_date = ?,
           project_name = ?, project_description = ?, help_needed = ?, technologies = ?,
           status = 'pending', admin_feedback = NULL, reviewed_by = NULL, reviewed_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(
      input.roomId,
      input.periodMonths,
      input.startDate,
      endDate,
      input.projectName,
      input.projectDescription,
      input.helpNeeded,
      JSON.stringify(input.technologies),
      bookingId
    );
  });

  txn();
  const updated = getBookingByIdForUser(userId, bookingId) as BookingDto;

  // Embedding güncelle
  const embText = bookingTextForEmbedding({
    projectName: updated.projectName,
    projectDescription: updated.projectDescription,
    technologies: updated.technologies,
  });
  saveBookingEmbedding(bookingId, embText).catch((err) =>
    logger.warn('embedding_update_failed', { bookingId, err: (err as Error).message })
  );

  broadcastBooking(
    { type: 'booking.updated', data: { bookingId, status: updated.status } },
    userId
  );

  return updated;
}

/**
 * Kullanıcı kendi booking'ini geri çeker.
 *
 * Güvenlik:
 * - IDOR: user_id + booking_id eşleşmesi
 * - Status kısıtı: pending/feedback_requested geri çekilebilir, approved/rejected çekilemez
 *   (Approved'lar için ayrı bir "iptal" akışı düşünülebilir prod'da)
 * - Hard delete (DB'den siler) — soft delete tercih edilse 'rejected' gibi yeni bir status
 *   eklenebilir. Demo için hard delete daha temiz.
 */
export function deleteBooking(userId: string, bookingId: string): { deleted: boolean; roomId: string } {
  const db = getDb();

  const txn = db.transaction(() => {
    const existing = db
      .prepare(`SELECT id, status, room_id FROM bookings WHERE id = ? AND user_id = ?`)
      .get(bookingId, userId) as { id: string; status: string; room_id: string } | undefined;

    if (!existing) {
      throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
    }
    if (existing.status !== 'pending' && existing.status !== 'feedback_requested') {
      throw new HttpError(
        409,
        'Onaylanmış veya reddedilmiş talepler geri çekilemez. Onaylı bir oda iptali için yöneticiye başvurun.',
        'BOOKING_NOT_WITHDRAWABLE'
      );
    }

    db.prepare('DELETE FROM bookings WHERE id = ?').run(bookingId);
    return existing.room_id;
  });

  const roomId = txn();
  deleteBookingEmbedding(bookingId);

  broadcastBooking({ type: 'booking.withdrawn', data: { bookingId } }, userId);
  broadcastToAdmins({ type: 'booking.withdrawn', data: { bookingId, roomId } });

  return { deleted: true, roomId };
}

export function listUserBookings(userId: string): BookingDto[] {
  const rows = getDb()
    .prepare(
      `SELECT b.*, r.name AS room_name, r.code AS room_code
       FROM bookings b
       INNER JOIN rooms r ON r.id = b.room_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`
    )
    .all(userId) as BookingRow[];
  return rows.map(rowToDto);
}

export function getBookingByIdForUser(userId: string, bookingId: string): BookingDto | undefined {
  const row = getDb()
    .prepare(
      `SELECT b.*, r.name AS room_name, r.code AS room_code
       FROM bookings b
       INNER JOIN rooms r ON r.id = b.room_id
       WHERE b.id = ? AND b.user_id = ?
       LIMIT 1`
    )
    .get(bookingId, userId) as BookingRow | undefined;
  return row ? rowToDto(row) : undefined;
}

export function listAllBookings(filters?: {
  status?: 'pending' | 'approved' | 'rejected' | 'feedback_requested';
}): BookingDto[] {
  const db = getDb();
  let sql = `
    SELECT b.*,
           r.name AS room_name, r.code AS room_code,
           u.email AS user_email, u.full_name AS user_full_name
    FROM bookings b
    INNER JOIN rooms r ON r.id = b.room_id
    INNER JOIN users u ON u.id = b.user_id
  `;
  const params: unknown[] = [];

  if (filters?.status) {
    sql += ' WHERE b.status = ?';
    params.push(filters.status);
  }

  sql += ' ORDER BY b.created_at DESC';

  const rows = db.prepare(sql).all(...params) as BookingRow[];
  return rows.map(rowToDto);
}

export function getBookingByIdAdmin(bookingId: string): BookingDto | undefined {
  const row = getDb()
    .prepare(
      `SELECT b.*,
              r.name AS room_name, r.code AS room_code,
              u.email AS user_email, u.full_name AS user_full_name
       FROM bookings b
       INNER JOIN rooms r ON r.id = b.room_id
       INNER JOIN users u ON u.id = b.user_id
       WHERE b.id = ?
       LIMIT 1`
    )
    .get(bookingId) as BookingRow | undefined;
  return row ? rowToDto(row) : undefined;
}

export function reviewBooking(
  adminId: string,
  bookingId: string,
  input: ReviewBookingInput
): BookingDto {
  const statusMap: Record<ReviewBookingInput['action'], BookingDto['status']> = {
    approve: 'approved',
    reject: 'rejected',
    request_feedback: 'feedback_requested',
  };
  const newStatus = statusMap[input.action];
  const db = getDb();

  const txn = db.transaction(() => {
    const existing = db
      .prepare(`SELECT id, status, room_id, start_date, end_date FROM bookings WHERE id = ?`)
      .get(bookingId) as
      | { id: string; status: string; room_id: string; start_date: string; end_date: string }
      | undefined;

    if (!existing) throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');

    if (newStatus === 'approved') {
      const conflict = db
        .prepare(
          `SELECT id FROM bookings
           WHERE room_id = ? AND id != ? AND status = 'approved'
             AND NOT (end_date < ? OR start_date > ?)
           LIMIT 1`
        )
        .get(existing.room_id, existing.id, existing.start_date, existing.end_date);
      if (conflict) {
        throw new HttpError(
          409,
          'Bu booking onaylanamaz, oda zaten başka bir onaylı booking ile dolu.',
          'ROOM_CONFLICT'
        );
      }
    }

    db.prepare(
      `UPDATE bookings
       SET status = ?, admin_feedback = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(newStatus, input.feedback ?? null, adminId, bookingId);
  });

  txn();
  const reviewed = getBookingByIdAdmin(bookingId) as BookingDto;

  // SSE: ilgili user'a + admin'lere yayın
  broadcastBooking(
    {
      type: 'booking.reviewed',
      data: {
        bookingId: reviewed.id,
        status: reviewed.status,
        adminFeedback: reviewed.adminFeedback,
      },
    },
    reviewed.userId
  );

  // E-posta: kullanıcıya inceleme sonucu
  if (reviewed.userEmail && (newStatus === 'approved' || newStatus === 'rejected' || newStatus === 'feedback_requested')) {
    void enqueueEmail(
      bookingReviewedEmail({
        to: reviewed.userEmail,
        toName: reviewed.userFullName ?? '',
        projectName: reviewed.projectName,
        roomCode: reviewed.roomCode,
        status: newStatus as 'approved' | 'rejected' | 'feedback_requested',
        feedback: reviewed.adminFeedback,
      })
    );
  }

  // Eğer reject ya da feedback_requested ile slot serbest kaldıysa,
  // waitlist promotion tetikle (oda durum değişimi).
  if (newStatus === 'rejected') {
    // Async — booking response'unu bekletme
    import('./waitlist.service')
      .then((m) => m.tryPromoteForRoom(reviewed.roomId))
      .catch((err) =>
        logger.warn('waitlist_promote_failed', {
          roomId: reviewed.roomId,
          err: (err as Error).message,
        })
      );
  }

  return reviewed;
}
