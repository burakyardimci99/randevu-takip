/**
 * Booking servisi.
 *
 * Güvenlik:
 * - app_security.md §10: Race condition için transaction içinde uygunluk kontrolü.
 * - app_security.md §5 (IDOR): User'lar yalnızca kendi booking'lerini görür.
 * - app_security.md §3: Tüm input zod ile doğrulanır, sorgular parameterized.
 */
import { nanoid } from 'nanoid';
import { dbAll, dbOne, dbRun, dbTx, getDb } from '../db/schema';
import { HttpError } from '../middleware/error.middleware';
import type { CreateBookingInput, ReviewBookingInput } from '../validators/schemas';
import {
  bookingTextForEmbedding,
  deleteBookingEmbedding,
  saveBookingEmbedding,
} from './embedding.service';
import { broadcastBooking, broadcastToAdmins } from './sse.service';
import { recordAudit } from './audit.service';
import { recordStageEvent } from './governance.service';
import {
  bookingCreatedAdminEmail,
  bookingReviewedEmail,
  enqueueEmail,
} from './notification.service';
import { logger } from '../utils/logger';

export type LifecycleStage =
  | 'application'
  | 'development'
  | 'stage'
  | 'production'
  | 'live';

export const LIFECYCLE_STAGE_ORDER: LifecycleStage[] = [
  'application',
  'development',
  'stage',
  'production',
  'live',
];

export interface BookingDto {
  id: string;
  userId: string;
  userEmail?: string;
  userFullName?: string;
  roomId: string;
  roomName: string;
  roomCode: string;
  periodMonths: number;
  /** Periyodik randevu — haftanın seçili günleri (1=Pzt..7=Paz). Tüm hafta = [1..7]. */
  weekdays: number[];
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
  /** Yaşam döngüsü aşaması — application → development → stage → production → live. */
  lifecycleStage: LifecycleStage;
  /** Mevcut aşamaya girilme zamanı (SLA + audit). */
  stageEnteredAt: string;
  /** Review akışı: 'standard' (normal) veya 'swat' (fast-track). */
  reviewTrack: 'standard' | 'swat';
  /** Kullanıcı admin'den bir sonraki aşamaya ilerletme talebinde bulunduysa timestamp. */
  stageAdvanceRequestedAt: string | null;
  /** Talep gerekçesi/notu (opsiyonel). */
  stageAdvanceNote: string | null;
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
  weekday_mask: number;
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
  lifecycle_stage: LifecycleStage;
  stage_entered_at: string;
  review_track: 'standard' | 'swat';
  stage_advance_requested_at: string | null;
  stage_advance_note: string | null;
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
    weekdays: maskToWeekdays(r.weekday_mask),
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
    lifecycleStage: r.lifecycle_stage,
    stageEnteredAt: r.stage_entered_at,
    reviewTrack: r.review_track,
    stageAdvanceRequestedAt: r.stage_advance_requested_at,
    stageAdvanceNote: r.stage_advance_note,
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

const FULL_WEEK_MASK = 127; // Pzt..Paz tüm günler

/** ISO gün dizisini (1=Pzt..7=Paz) 7-bit maskeye çevirir. Boş/undefined → tüm hafta. */
function weekdaysToMask(weekdays?: number[]): number {
  if (!weekdays || weekdays.length === 0) return FULL_WEEK_MASK;
  let mask = 0;
  for (const d of weekdays) {
    if (d >= 1 && d <= 7) mask |= 1 << (d - 1);
  }
  return mask === 0 ? FULL_WEEK_MASK : mask;
}

/** Maskeyi ISO gün dizisine (1=Pzt..7=Paz) çevirir. */
function maskToWeekdays(mask: number): number[] {
  const days: number[] = [];
  for (let d = 1; d <= 7; d++) {
    if (mask & (1 << (d - 1))) days.push(d);
  }
  return days;
}

function isValidStartDate(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(`${dateStr}T00:00:00`);
  return start.getTime() >= today.getTime();
}

export async function createBooking(userId: string, input: CreateBookingInput): Promise<BookingDto> {
  if (!isValidStartDate(input.startDate)) {
    throw new HttpError(400, 'Başlangıç tarihi bugünden önce olamaz.', 'INVALID_START_DATE');
  }

  const endDate = addMonths(input.startDate, input.periodMonths);

  const bookingId = await dbTx(async () => {
    const room = await dbOne(`SELECT id, code, name FROM rooms WHERE id = ? AND is_active = 1`, [input.roomId]) as { id: string; code: string; name: string } | undefined;

    if (!room) {
      throw new HttpError(404, 'Oda bulunamadı.', 'ROOM_NOT_FOUND');
    }

    const weekdayMask = weekdaysToMask(input.weekdays);

    const conflict = await dbOne(`SELECT id FROM bookings
         WHERE room_id = ?
           AND status IN ('pending', 'approved', 'feedback_requested')
           AND NOT (end_date < ? OR start_date > ?)
           AND (weekday_mask & ?) != 0
         LIMIT 1`, [input.roomId, input.startDate, endDate, weekdayMask]);

    if (conflict) {
      throw new HttpError(
        409,
        'Seçtiğiniz günlerde bu oda, bu tarih aralığında dolu.',
        'ROOM_NOT_AVAILABLE'
      );
    }

    const id = nanoid();
    await dbRun(`INSERT INTO bookings (
        id, user_id, room_id, period_months, weekday_mask, start_date, end_date,
        project_name, project_description, help_needed, technologies, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`, [id,
      userId,
      input.roomId,
      input.periodMonths,
      weekdayMask,
      input.startDate,
      endDate,
      input.projectName,
      input.projectDescription,
      input.helpNeeded,
      JSON.stringify(input.technologies)]);

    return id;
  });
  const created = await getBookingByIdForUser(userId, bookingId) as BookingDto;

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
  const admins = await dbAll("SELECT email FROM admins WHERE status = 1", []) as Array<{ email: string }>;
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
export async function updateBooking(
  userId: string,
  bookingId: string,
  input: CreateBookingInput
): Promise<BookingDto> {
  const endDate = addMonths(input.startDate, input.periodMonths);

  await dbTx(async () => {
    // 1) Booking varlığı + sahiplik + status kontrolü
    const existing = await dbOne(`SELECT id, status, room_id, user_id
         FROM bookings WHERE id = ? AND user_id = ?`, [bookingId, userId]) as
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
    const room = await dbOne(`SELECT id FROM rooms WHERE id = ? AND is_active = 1`, [input.roomId]) as { id: string } | undefined;
    if (!room) throw new HttpError(404, 'Oda bulunamadı.', 'ROOM_NOT_FOUND');

    // 3) Gün-bazlı çakışma — kendi booking'i hariç, aynı gün + tarih örtüşmesi
    const weekdayMask = weekdaysToMask(input.weekdays);
    const conflict = await dbOne(`SELECT id FROM bookings
         WHERE room_id = ?
           AND id != ?
           AND status IN ('pending', 'approved', 'feedback_requested')
           AND NOT (end_date < ? OR start_date > ?)
           AND (weekday_mask & ?) != 0
         LIMIT 1`, [input.roomId, bookingId, input.startDate, endDate, weekdayMask]);
    if (conflict) {
      throw new HttpError(
        409,
        'Seçtiğiniz günlerde bu oda, bu tarih aralığında dolu.',
        'ROOM_NOT_AVAILABLE'
      );
    }

    // 4) Güncelle: düzenleme sonrası admin tekrar incelesin → status='pending'
    await dbRun(`UPDATE bookings
       SET room_id = ?, period_months = ?, weekday_mask = ?, start_date = ?, end_date = ?,
           project_name = ?, project_description = ?, help_needed = ?, technologies = ?,
           status = 'pending', admin_feedback = NULL, reviewed_by = NULL, reviewed_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [input.roomId,
      input.periodMonths,
      weekdayMask,
      input.startDate,
      endDate,
      input.projectName,
      input.projectDescription,
      input.helpNeeded,
      JSON.stringify(input.technologies),
      bookingId]);
  });
  const updated = await getBookingByIdForUser(userId, bookingId) as BookingDto;

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
export async function deleteBooking(userId: string, bookingId: string): Promise<{ deleted: boolean; roomId: string }> {

  const roomId = await dbTx(async () => {
    const existing = await dbOne(`SELECT id, status, room_id FROM bookings WHERE id = ? AND user_id = ?`, [bookingId, userId]) as { id: string; status: string; room_id: string } | undefined;

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

    await dbRun('DELETE FROM bookings WHERE id = ?', [bookingId]);
    return existing.room_id;
  });
  deleteBookingEmbedding(bookingId);

  broadcastBooking({ type: 'booking.withdrawn', data: { bookingId } }, userId);
  broadcastToAdmins({ type: 'booking.withdrawn', data: { bookingId, roomId } });

  return { deleted: true, roomId };
}

export async function listUserBookings(userId: string): Promise<BookingDto[]> {
  const rows = await dbAll(`SELECT b.*, r.name AS room_name, r.code AS room_code
       FROM bookings b
       INNER JOIN rooms r ON r.id = b.room_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`, [userId]) as BookingRow[];
  return rows.map(rowToDto);
}

export async function getBookingByIdForUser(userId: string, bookingId: string): Promise<BookingDto | undefined> {
  const row = await dbOne(`SELECT b.*, r.name AS room_name, r.code AS room_code
       FROM bookings b
       INNER JOIN rooms r ON r.id = b.room_id
       WHERE b.id = ? AND b.user_id = ?
       LIMIT 1`, [bookingId, userId]) as BookingRow | undefined;
  return row ? rowToDto(row) : undefined;
}

export async function listAllBookings(filters?: {
  status?: 'pending' | 'approved' | 'rejected' | 'feedback_requested';
}): Promise<BookingDto[]> {
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

  const rows = await dbAll(sql, [...params]) as BookingRow[];
  return rows.map(rowToDto);
}

export async function getBookingByIdAdmin(bookingId: string): Promise<BookingDto | undefined> {
  const row = await dbOne(`SELECT b.*,
              r.name AS room_name, r.code AS room_code,
              u.email AS user_email, u.full_name AS user_full_name
       FROM bookings b
       INNER JOIN rooms r ON r.id = b.room_id
       INNER JOIN users u ON u.id = b.user_id
       WHERE b.id = ?
       LIMIT 1`, [bookingId]) as BookingRow | undefined;
  return row ? rowToDto(row) : undefined;
}

export interface ReviewBookingResult {
  booking: BookingDto;
  /** Admin approve denedi ama oda doluydu → otomatik waitlist'e taşındı. */
  autoWaitlisted?: boolean;
  /** Waitlist'e taşındıysa atanmış sıra numarası. */
  waitlistPosition?: number;
}

export async function reviewBooking(
  adminId: string,
  bookingId: string,
  input: ReviewBookingInput,
  /** Review eden rol — admin ya da Analitik Danışman. Audit/timeline doğruluğu için. */
  actorType: 'admin' | 'danisman' = 'admin'
): Promise<ReviewBookingResult> {
  const statusMap: Record<ReviewBookingInput['action'], BookingDto['status']> = {
    approve: 'approved',
    reject: 'rejected',
    request_feedback: 'feedback_requested',
  };
  let newStatus = statusMap[input.action];
  let autoWaitlistedPosition: number | null = null;

  await dbTx(async () => {
    const existing = await dbOne(`SELECT id, user_id, status, room_id, period_months, weekday_mask, start_date, end_date,
                project_name, project_description, help_needed, technologies
         FROM bookings WHERE id = ?`, [bookingId]) as
      | {
          id: string;
          user_id: string;
          status: string;
          room_id: string;
          period_months: 1 | 2 | 3;
          weekday_mask: number;
          start_date: string;
          end_date: string;
          project_name: string;
          project_description: string;
          help_needed: string;
          technologies: string;
        }
      | undefined;

    if (!existing) throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');

    if (newStatus === 'approved') {
      const conflict = await dbOne(`SELECT id FROM bookings
           WHERE room_id = ? AND id != ? AND status = 'approved'
             AND NOT (end_date < ? OR start_date > ?)
             AND (weekday_mask & ?) != 0
           LIMIT 1`, [existing.room_id, existing.id, existing.start_date, existing.end_date, existing.weekday_mask]);
      if (conflict) {
        // ❗ Eski davranış 409 ROOM_CONFLICT fırlatıyordu. Yeni davranış: bu
        // booking'i otomatik olarak waitlist'e ekle, kendisini 'rejected' yap.
        // Kullanıcı bekleme listesinde sıra alır; oda boşaldığında promote edilir.

        // 1) Mevcut waiting kuyrukta sıra numarası belirle.
        const maxRow = await dbOne(`SELECT COALESCE(MAX(position), 0) AS max_pos
             FROM waitlist WHERE room_id = ? AND status = 'waiting'`, [existing.room_id]) as { max_pos: number };
        const position = maxRow.max_pos + 1;

        // 2) Aynı user aynı oda + aynı tarih için zaten kayıt var mı?
        const dupe = await dbOne(`SELECT id FROM waitlist
             WHERE user_id = ? AND room_id = ? AND desired_start_date = ?
               AND status IN ('waiting', 'promoted')
             LIMIT 1`, [existing.user_id, existing.room_id, existing.start_date]);

        if (!dupe) {
          const wId = nanoid();
          await dbRun(`INSERT INTO waitlist (
               id, user_id, room_id, period_months, desired_start_date,
               project_name, project_description, help_needed, technologies, position, status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting')`, [wId,
            existing.user_id,
            existing.room_id,
            existing.period_months,
            existing.start_date,
            existing.project_name,
            existing.project_description,
            existing.help_needed,
            existing.technologies,
            position]);
        }

        // 3) Booking artık reddedilmiş + otomatik açıklayıcı feedback.
        newStatus = 'rejected';
        autoWaitlistedPosition = position;
        const autoFeedback =
          `Oda bu tarih aralığında dolu olduğu için talebiniz otomatik olarak ` +
          `bekleme listesine alındı (sıra: ${position}). Oda boşaldığında ` +
          `yeniden değerlendirilecektir.` +
          (input.feedback ? `\n\nAdmin notu: ${input.feedback}` : '');

        await dbRun(`UPDATE bookings
           SET status = 'rejected', admin_feedback = ?, reviewed_by = ?,
               reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`, [autoFeedback, adminId, bookingId]);

        return; // status update tamam, aşağıdaki update'i atla
      }
    }

    await dbRun(`UPDATE bookings
       SET status = ?, admin_feedback = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [newStatus, input.feedback ?? null, adminId, bookingId]);

    // Onay sonrası proje yaşam döngüsüne giriş: application → development
    // (sadece henüz application aşamasındaki booking'ler için; tekrar approve'da
    // mevcut aşama korunur).
    if (newStatus === 'approved') {
      await dbRun(`UPDATE bookings
         SET lifecycle_stage = 'development',
             stage_entered_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND lifecycle_stage = 'application'`, [bookingId]);
    }
  });
  const reviewed = await getBookingByIdAdmin(bookingId) as BookingDto;

  // Audit timeline: ilk onayda application → development geçişini kaydet.
  // (advance/regress kendi fonksiyonlarında ayrı stage event'i atar.)
  if (newStatus === 'approved' && reviewed.lifecycleStage === 'development') {
    await recordStageEvent({
      requestId: bookingId,
      fromStage: 'application',
      toStage: 'development',
      actorId: adminId,
      actorType,
      note: input.feedback || 'İlk onay — geliştirme aşamasına geçti.',
    });
  }

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

  // In-app bildirim — talep sahibine.
  void import('./notification-center.service').then((m) => {
    const notifTitle =
      newStatus === 'approved'
        ? 'Randevu talebin onaylandı'
        : newStatus === 'rejected'
          ? 'Randevu talebin reddedildi'
          : 'Randevu talebin için düzeltme istendi';
    m.pushNotification({
      recipientId: reviewed.userId,
      recipientType: 'user',
      category: 'booking',
      title: notifTitle,
      body: `"${reviewed.projectName}" (${reviewed.roomCode}) — Taleplerim sayfasından görüntüle.`,
      link: '/bookings',
    });
  });

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

  // Otomatik waitlist'e taşındıysa: admin'lere kuyruğun güncellendiğini bildir
  // + kullanıcıya in-app bildirim (toast yerine kalıcı notification).
  if (autoWaitlistedPosition !== null) {
    recordAudit({
      eventType: 'waitlist.joined',
      subjectId: adminId,
      subjectType: actorType,
      success: true,
      details: {
        bookingId,
        userId: reviewed.userId,
        roomId: reviewed.roomId,
        position: autoWaitlistedPosition,
        autoFromBooking: true,
      },
    });
    broadcastToAdmins({
      type: 'waitlist.changed',
      data: { roomId: reviewed.roomId, action: 'auto_added_from_booking' },
    });
  }

  return {
    booking: reviewed,
    autoWaitlisted: autoWaitlistedPosition !== null,
    waitlistPosition: autoWaitlistedPosition ?? undefined,
  };
}

/**
 * Admin: bir booking'i başka bir odaya taşır (oda ataması değiştirme).
 *
 * Onaylı bir booking taşınırken hedef oda aynı tarih aralığında başka bir
 * onaylı booking ile çakışmamalı (race condition koruması — transaction).
 */
export async function reassignBookingRoom(
  adminId: string,
  bookingId: string,
  newRoomId: string
): Promise<BookingDto> {

  const oldRoomId = await dbTx(async () => {
    const existing = await dbOne(`SELECT id, room_id, status, weekday_mask, start_date, end_date FROM bookings WHERE id = ?`, [bookingId]) as
      | { id: string; room_id: string; status: string; weekday_mask: number; start_date: string; end_date: string }
      | undefined;
    if (!existing) throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');

    if (existing.room_id === newRoomId) {
      throw new HttpError(400, 'Booking zaten bu odada.', 'SAME_ROOM');
    }

    const room = await dbOne(`SELECT id FROM rooms WHERE id = ? AND is_active = 1`, [newRoomId]) as { id: string } | undefined;
    if (!room) throw new HttpError(404, 'Hedef oda bulunamadı.', 'ROOM_NOT_FOUND');

    // Onaylı booking için hedef odada tarih çakışması kontrolü.
    if (existing.status === 'approved') {
      const conflict = await dbOne(`SELECT id FROM bookings
           WHERE room_id = ? AND id != ? AND status = 'approved'
             AND NOT (end_date < ? OR start_date > ?)
             AND (weekday_mask & ?) != 0
           LIMIT 1`, [newRoomId, existing.id, existing.start_date, existing.end_date, existing.weekday_mask]);
      if (conflict) {
        throw new HttpError(
          409,
          'Hedef oda bu tarih aralığında başka bir onaylı booking ile dolu.',
          'ROOM_CONFLICT'
        );
      }
    }

    await dbRun(`UPDATE bookings SET room_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newRoomId, bookingId]);

    return existing.room_id;
  });
  const reassigned = await getBookingByIdAdmin(bookingId) as BookingDto;

  recordAudit({
    eventType: 'booking.reassigned',
    subjectId: adminId,
    subjectType: 'admin',
    success: true,
    details: { bookingId, fromRoomId: oldRoomId, toRoomId: newRoomId },
  });

  broadcastBooking(
    { type: 'booking.updated', data: { bookingId, kind: 'reassigned' } },
    reassigned.userId
  );

  return reassigned;
}

/**
 * Admin: bir booking'i tamamen siler (hard delete).
 *
 * Kullanıcı `deleteBooking`'inden farkı:
 *  - Status fark etmez (approved/rejected dahil tümü silinebilir).
 *  - Audit'e `booking.admin_deleted` event tipi düşer.
 *  - Booking onaylıydıysa odada slot serbest kalır → waitlist promote tetiklenir.
 */
export async function adminDeleteBooking(
  adminId: string,
  bookingId: string
): Promise<{ deleted: boolean; roomId: string; userId: string; wasApproved: boolean }> {

  const existing = await dbTx(async () => {
    const existing = await dbOne(`SELECT id, user_id, room_id, status FROM bookings WHERE id = ?`, [bookingId]) as
      | { id: string; user_id: string; room_id: string; status: string }
      | undefined;

    if (!existing) {
      throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
    }

    await dbRun('DELETE FROM bookings WHERE id = ?', [bookingId]);
    return existing;
  });
  deleteBookingEmbedding(bookingId);

  recordAudit({
    eventType: 'booking.admin_deleted',
    subjectId: adminId,
    subjectType: 'admin',
    success: true,
    details: {
      bookingId,
      userId: existing.user_id,
      roomId: existing.room_id,
      previousStatus: existing.status,
    },
  });

  broadcastBooking(
    { type: 'booking.withdrawn', data: { bookingId } },
    existing.user_id
  );
  broadcastToAdmins({
    type: 'booking.withdrawn',
    data: { bookingId, roomId: existing.room_id },
  });

  const wasApproved = existing.status === 'approved';
  if (wasApproved) {
    // Slot boşaldı → waitlist promotion (async, response'u bekletmez).
    import('./waitlist.service')
      .then((m) => m.tryPromoteForRoom(existing.room_id))
      .catch((err) =>
        logger.warn('waitlist_promote_failed', {
          roomId: existing.room_id,
          err: (err as Error).message,
        })
      );
  }

  return {
    deleted: true,
    roomId: existing.room_id,
    userId: existing.user_id,
    wasApproved,
  };
}

/**
 * Admin: bir booking'in user'ını değiştirir (kullanıcı yeniden atama).
 *
 * Kullanım: oda dolu ama yanlış kişi rezervasyon yapmış → admin doğru kullanıcıya
 * taşır. Onaylı booking için ek bir tarih çakışma kontrolü gerekmez (oda zaten
 * o tarihte bu booking'e ayrılmış).
 */
export async function reassignBookingUser(
  adminId: string,
  bookingId: string,
  newUserId: string
): Promise<BookingDto> {

  const existing = await dbTx(async () => {
    const existing = await dbOne(`SELECT id, user_id, room_id, status FROM bookings WHERE id = ?`, [bookingId]) as
      | { id: string; user_id: string; room_id: string; status: string }
      | undefined;
    if (!existing) {
      throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
    }

    if (existing.user_id === newUserId) {
      throw new HttpError(400, 'Booking zaten bu kullanıcıya ait.', 'SAME_USER');
    }

    const user = await dbOne(`SELECT id FROM users WHERE id = ? AND status = 1`, [newUserId]) as { id: string } | undefined;
    if (!user) {
      throw new HttpError(404, 'Hedef kullanıcı bulunamadı veya pasif.', 'USER_NOT_FOUND');
    }

    await dbRun(`UPDATE bookings SET user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [newUserId, bookingId]);

    return existing;
  });
  const reassigned = await getBookingByIdAdmin(bookingId) as BookingDto;

  recordAudit({
    eventType: 'booking.user_reassigned',
    subjectId: adminId,
    subjectType: 'admin',
    success: true,
    details: {
      bookingId,
      fromUserId: existing.user_id,
      toUserId: newUserId,
      roomId: existing.room_id,
    },
  });

  // Hem eski hem yeni user'a haber ver, ayrıca admin kanalı.
  broadcastBooking(
    { type: 'booking.updated', data: { bookingId, kind: 'user_reassigned' } },
    existing.user_id
  );
  broadcastBooking(
    { type: 'booking.updated', data: { bookingId, kind: 'user_reassigned' } },
    newUserId
  );
  broadcastToAdmins({
    type: 'booking.updated',
    data: { bookingId, kind: 'user_reassigned' },
  });

  return reassigned;
}

/**
 * Admin / Ar-Ge: bir booking'i yaşam döngüsünde bir sonraki aşamaya ilerletir.
 *
 *   application → development → stage → production → live
 *
 * 'application' aşamasından çıkış zaten reviewBooking(approve) ile yapılır,
 * bu fonksiyon onun ötesindeki manuel ilerletmeler için kullanılır. Booking
 * onaylanmış olmalıdır (status='approved').
 *
 * `actorType` audit + zaman çizelgesi doğruluğu için: admin route 'admin',
 * governance/arge route 'arge' geçer (kim ilerletti net kalır).
 */
export async function advanceBookingLifecycle(
  actorId: string,
  bookingId: string,
  actorType: 'admin' | 'arge' = 'admin'
): Promise<BookingDto> {

  const { from, to } = await dbTx(async () => {
    const existing = await dbOne(`SELECT id, status, lifecycle_stage FROM bookings WHERE id = ?`, [bookingId]) as
      | { id: string; status: string; lifecycle_stage: LifecycleStage }
      | undefined;
    if (!existing) {
      throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
    }
    if (existing.status !== 'approved') {
      throw new HttpError(
        409,
        'Sadece onaylanmış booking ilerletilebilir.',
        'BOOKING_NOT_APPROVED'
      );
    }

    const currentIdx = LIFECYCLE_STAGE_ORDER.indexOf(existing.lifecycle_stage);
    if (currentIdx < 0 || currentIdx >= LIFECYCLE_STAGE_ORDER.length - 1) {
      throw new HttpError(
        409,
        'Booking zaten son aşamada (live).',
        'LIFECYCLE_TERMINAL'
      );
    }
    const next = LIFECYCLE_STAGE_ORDER[currentIdx + 1];

    // İlerlerken varsa bekleyen kullanıcı talebi tüketilir (talep karşılandı).
    await dbRun(`UPDATE bookings
       SET lifecycle_stage = ?, stage_entered_at = CURRENT_TIMESTAMP,
           stage_advance_requested_at = NULL,
           stage_advance_note = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [next, bookingId]);

    return { from: existing.lifecycle_stage, to: next };
  });
  const updated = await getBookingByIdAdmin(bookingId) as BookingDto;

  recordAudit({
    eventType: 'booking.updated',
    subjectId: actorId,
    subjectType: actorType,
    success: true,
    details: { bookingId, kind: 'lifecycle_advanced', fromStage: from, toStage: to },
  });

  await recordStageEvent({
    requestId: bookingId,
    fromStage: from,
    toStage: to,
    actorId,
    actorType,
    note: 'Aşama ilerletildi.',
  });

  broadcastBooking(
    {
      type: 'booking.updated',
      data: { bookingId, kind: 'lifecycle_advanced', stage: to },
    },
    updated.userId
  );
  broadcastToAdmins({
    type: 'booking.updated',
    data: { bookingId, kind: 'lifecycle_advanced', stage: to },
  });

  return updated;
}

/**
 * Admin / Ar-Ge: bir booking'i yaşam döngüsünde bir önceki aşamaya geri al.
 *
 *   live → production → stage → development
 *
 * 'development'dan geri 'application'a düşmek senaryosu manuel iptal anlamına
 * gelir ve burada engellenir; bunun yerine reviewBooking(reject) kullanılmalı.
 *
 * `actorType` audit + zaman çizelgesi doğruluğu için (advanceBookingLifecycle ile aynı).
 */
export async function regressBookingLifecycle(
  actorId: string,
  bookingId: string,
  actorType: 'admin' | 'arge' = 'admin'
): Promise<BookingDto> {

  const { from, to } = await dbTx(async () => {
    const existing = await dbOne(`SELECT id, status, lifecycle_stage FROM bookings WHERE id = ?`, [bookingId]) as
      | { id: string; status: string; lifecycle_stage: LifecycleStage }
      | undefined;
    if (!existing) {
      throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
    }
    if (existing.status !== 'approved') {
      throw new HttpError(
        409,
        'Sadece onaylanmış booking geri alınabilir.',
        'BOOKING_NOT_APPROVED'
      );
    }

    const currentIdx = LIFECYCLE_STAGE_ORDER.indexOf(existing.lifecycle_stage);
    if (currentIdx <= 1) {
      // 0 = application, 1 = development. Daha geri gitmek istenirse review-reject akışı.
      throw new HttpError(
        409,
        'Booking en erken aşamada — daha geri alınamaz.',
        'LIFECYCLE_AT_START'
      );
    }
    const prev = LIFECYCLE_STAGE_ORDER[currentIdx - 1];

    await dbRun(`UPDATE bookings
       SET lifecycle_stage = ?, stage_entered_at = CURRENT_TIMESTAMP,
           stage_advance_requested_at = NULL,
           stage_advance_note = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [prev, bookingId]);

    return { from: existing.lifecycle_stage, to: prev };
  });
  const updated = await getBookingByIdAdmin(bookingId) as BookingDto;

  recordAudit({
    eventType: 'booking.updated',
    subjectId: actorId,
    subjectType: actorType,
    success: true,
    details: { bookingId, kind: 'lifecycle_regressed', fromStage: from, toStage: to },
  });

  await recordStageEvent({
    requestId: bookingId,
    fromStage: from,
    toStage: to,
    actorId,
    actorType,
    note: 'Aşama geri alındı.',
  });

  broadcastBooking(
    {
      type: 'booking.updated',
      data: { bookingId, kind: 'lifecycle_regressed', stage: to },
    },
    updated.userId
  );
  broadcastToAdmins({
    type: 'booking.updated',
    data: { bookingId, kind: 'lifecycle_regressed', stage: to },
  });

  return updated;
}

/**
 * Admin: bir booking'i SWAT (fast-track) inceleme akışına alır veya çıkarır.
 * SWAT işareti review için "yüksek öncelikli" anlamına gelir.
 */
export async function setBookingReviewTrack(
  adminId: string,
  bookingId: string,
  track: 'standard' | 'swat'
): Promise<BookingDto> {
  const existing = await dbOne(`SELECT id, review_track FROM bookings WHERE id = ?`, [bookingId]) as { id: string; review_track: string } | undefined;
  if (!existing) {
    throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
  }
  if (existing.review_track === track) {
    throw new HttpError(400, 'Booking zaten bu inceleme akışında.', 'SAME_TRACK');
  }
  await dbRun(`UPDATE bookings SET review_track = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [track, bookingId]);

  const updated = await getBookingByIdAdmin(bookingId) as BookingDto;

  recordAudit({
    eventType: 'booking.updated',
    subjectId: adminId,
    subjectType: 'admin',
    success: true,
    details: { bookingId, kind: 'review_track_changed', track },
  });

  broadcastBooking(
    { type: 'booking.updated', data: { bookingId, kind: 'review_track_changed', track } },
    updated.userId
  );
  broadcastToAdmins({
    type: 'booking.updated',
    data: { bookingId, kind: 'review_track_changed', track },
  });

  return updated;
}

/**
 * Kullanıcı: onaylı projesinin bir sonraki aşamaya ilerletilmesi için admin'den
 * talep oluşturur. Talep yoksa stage_advance_requested_at=now, varsa idempotent
 * olarak yenilenir (kullanıcı not'unu güncelleyebilir).
 */
export async function requestStageAdvance(
  userId: string,
  bookingId: string,
  note?: string
): Promise<BookingDto> {

  await dbTx(async () => {
    const existing = await dbOne(`SELECT id, user_id, status, lifecycle_stage FROM bookings WHERE id = ?`, [bookingId]) as
      | { id: string; user_id: string; status: string; lifecycle_stage: LifecycleStage }
      | undefined;
    if (!existing) {
      throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
    }
    if (existing.user_id !== userId) {
      throw new HttpError(403, 'Bu booking size ait değil.', 'NOT_OWNED');
    }
    if (existing.status !== 'approved') {
      throw new HttpError(
        409,
        'Sadece onaylı projeler için aşama talebi oluşturulabilir.',
        'BOOKING_NOT_APPROVED'
      );
    }
    const idx = LIFECYCLE_STAGE_ORDER.indexOf(existing.lifecycle_stage);
    if (idx >= LIFECYCLE_STAGE_ORDER.length - 1) {
      throw new HttpError(
        409,
        'Proje zaten son aşamada (canlı).',
        'LIFECYCLE_TERMINAL'
      );
    }

    await dbRun(`UPDATE bookings
       SET stage_advance_requested_at = CURRENT_TIMESTAMP,
           stage_advance_note = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [(note ?? '').trim().slice(0, 500) || null, bookingId]);
  });
  const updated = await getBookingByIdAdmin(bookingId) as BookingDto;

  recordAudit({
    eventType: 'booking.updated',
    subjectId: userId,
    subjectType: 'user',
    success: true,
    details: { bookingId, kind: 'stage_advance_requested', note: note ?? null },
  });

  // Sadece adminlere bildir — yeni iş kuyruğunda.
  broadcastToAdmins({
    type: 'booking.updated',
    data: {
      bookingId,
      kind: 'stage_advance_requested',
      userId: updated.userId,
      currentStage: updated.lifecycleStage,
    },
  });

  return updated;
}

/**
 * Admin: kullanıcının aşama ilerletme talebini reddet (ilerletmeden iptal et).
 * Reddedildiğinde sebep `note` parametresi ile audit log'a düşer.
 */
export async function rejectStageAdvanceRequest(
  adminId: string,
  bookingId: string,
  note?: string
): Promise<BookingDto> {
  const existing = await dbOne(`SELECT id, user_id, stage_advance_requested_at FROM bookings WHERE id = ?`, [bookingId]) as
    | { id: string; user_id: string; stage_advance_requested_at: string | null }
    | undefined;
  if (!existing) {
    throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
  }
  if (!existing.stage_advance_requested_at) {
    throw new HttpError(409, 'Bekleyen bir aşama talebi yok.', 'NO_REQUEST');
  }

  await dbRun(`UPDATE bookings
     SET stage_advance_requested_at = NULL,
         stage_advance_note = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`, [bookingId]);

  const updated = await getBookingByIdAdmin(bookingId) as BookingDto;

  recordAudit({
    eventType: 'booking.updated',
    subjectId: adminId,
    subjectType: 'admin',
    success: true,
    details: { bookingId, kind: 'stage_advance_rejected', adminNote: note ?? null },
  });

  broadcastBooking(
    { type: 'booking.updated', data: { bookingId, kind: 'stage_advance_rejected' } },
    existing.user_id
  );
  broadcastToAdmins({
    type: 'booking.updated',
    data: { bookingId, kind: 'stage_advance_rejected' },
  });

  return updated;
}
