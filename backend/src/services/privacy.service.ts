/**
 * KVKK / GDPR uyum servisi.
 *
 * Sağladığı haklar:
 *  - Right to access (Md.11/b): kullanıcı kendi tüm verisini JSON olarak indirir.
 *  - Right to be forgotten (Md.11/e — silme): kullanıcının verileri kalıcı silinir
 *    veya pseudonymize edilir (booking history için).
 *  - Right to rectification: profil update endpoint zaten var.
 *
 * Strateji:
 *  - Soft delete + PII purge: kullanıcı silindiğinde:
 *    1) users.status = 3 (soft delete — IDOR FK koruması için)
 *    2) users.full_name, email, department, title, manager, phone, bio, project_idea → pseudonymize
 *    3) Tüm refresh_tokens → revoke
 *    4) Tüm waitlist entries → 'cancelled'
 *    5) Bookings: status='approved' olanlar tarih bütünlüğü için kalır,
 *       diğerleri silinir; kalanların project_description'ında PII varsa scrub.
 *       (Audit için booking history korunur — anonymized.)
 *    6) project_embeddings → silinir (tekrar hesaplanabilir, geçmişi tutmaya gerek yok).
 *    7) audit_logs → değişmez (compliance/forensic; retention süresi
 *       data_security §11 ile yönetilir).
 *
 * Audit:
 *  - export → 'user.data_export' event
 *  - delete → 'user.data_purge' event
 */
import { getDb } from '../db/schema';
import { HttpError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { recordAudit } from './audit.service';

export interface UserDataExport {
  generatedAt: string;
  schemaVersion: string;
  user: Record<string, unknown>;
  bookings: Array<Record<string, unknown>>;
  waitlist: Array<Record<string, unknown>>;
  auditLog: Array<Record<string, unknown>>;
}

/**
 * Kullanıcının tüm verilerini JSON olarak döner.
 * IDOR: yalnız çağıran user kendi verisini görür.
 */
export function exportUserData(userId: string): UserDataExport {
  const db = getDb();

  const user = db
    .prepare(
      `SELECT id, email, full_name, role, department, title, manager, phone, bio,
              project_idea, status, created_at, updated_at
       FROM users WHERE id = ? LIMIT 1`
    )
    .get(userId) as Record<string, unknown> | undefined;
  if (!user) throw new HttpError(404, 'Kullanıcı bulunamadı.', 'USER_NOT_FOUND');

  const bookings = db
    .prepare(
      `SELECT b.id, b.room_id, b.period_months, b.start_date, b.end_date,
              b.project_name, b.project_description, b.help_needed, b.technologies,
              b.status, b.admin_feedback, b.reviewed_at, b.created_at, b.updated_at,
              r.code AS room_code, r.name AS room_name
       FROM bookings b
       INNER JOIN rooms r ON r.id = b.room_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`
    )
    .all(userId) as Array<Record<string, unknown>>;

  const waitlist = db
    .prepare(
      `SELECT w.id, w.room_id, w.period_months, w.desired_start_date,
              w.project_name, w.project_description, w.help_needed, w.technologies,
              w.position, w.status, w.created_at, w.updated_at,
              r.code AS room_code, r.name AS room_name
       FROM waitlist w
       INNER JOIN rooms r ON r.id = w.room_id
       WHERE w.user_id = ?
       ORDER BY w.created_at DESC`
    )
    .all(userId) as Array<Record<string, unknown>>;

  // Audit log: yalnız bu kullanıcıyı subject olarak alan kayıtlar
  const auditLog = db
    .prepare(
      `SELECT event_type, success, details, created_at, ip_address
       FROM audit_logs
       WHERE subject_id = ? AND subject_type = 'user'
       ORDER BY created_at DESC
       LIMIT 500`
    )
    .all(userId) as Array<Record<string, unknown>>;

  recordAudit({
    eventType: 'user.update', // 'user.data_export' ekleyebiliriz; şimdilik 'user.update'
    subjectId: userId,
    subjectType: 'user',
    success: true,
    details: { action: 'data_export', bookings: bookings.length, waitlist: waitlist.length },
  });

  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: '1.0',
    user,
    bookings,
    waitlist,
    auditLog,
  };
}

/**
 * Right to be forgotten — KVKK Md.11/e.
 *
 * Geri dönüşü YOK. Soft-delete + PII purge.
 * Pending/feedback_requested booking'ler silinir. Approved booking'ler
 * pseudonymize edilir (tarih bütünlüğü + admin audit için).
 *
 * Çağıran:
 *  - user kendisi (self-service), VEYA
 *  - admin (başka user için, audit'le)
 *
 * NOT: audit_logs SİLİNMEZ — compliance retention süresine tâbi (data_security §11).
 */
export interface PurgeResult {
  purgedUser: { id: string; pseudonymizedAs: string };
  deletedBookings: number;
  pseudonymizedBookings: number;
  cancelledWaitlist: number;
  revokedTokens: number;
  deletedEmbeddings: number;
}

export function purgeUser(userId: string, requestedBy: { id: string; type: 'user' | 'admin' }): PurgeResult {
  const db = getDb();
  const pseudo = `deleted-${userId.slice(0, 8)}`;

  const txn = db.transaction(() => {
    const existing = db
      .prepare(`SELECT id, status FROM users WHERE id = ? LIMIT 1`)
      .get(userId) as { id: string; status: number } | undefined;
    if (!existing) throw new HttpError(404, 'Kullanıcı bulunamadı.', 'USER_NOT_FOUND');

    // 1) Pending/feedback bookings → silinir + embedding sil
    const deletable = db
      .prepare(
        `SELECT id FROM bookings
         WHERE user_id = ? AND status IN ('pending', 'feedback_requested')`
      )
      .all(userId) as Array<{ id: string }>;
    for (const b of deletable) {
      db.prepare('DELETE FROM project_embeddings WHERE booking_id = ?').run(b.id);
    }
    const delRes = db
      .prepare(
        `DELETE FROM bookings WHERE user_id = ?
         AND status IN ('pending', 'feedback_requested')`
      )
      .run(userId);

    // 2) Approved/rejected bookings → pseudonymize (PII scrub)
    const pseudonymizeRes = db
      .prepare(
        `UPDATE bookings
         SET project_description = '[Kullanıcı tarafından silindi]',
             help_needed = '[Kullanıcı tarafından silindi]',
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND status IN ('approved', 'rejected')`
      )
      .run(userId);

    // Approved bookings'in embedding'lerini de sil (re-index gerekirse)
    db.prepare(
      `DELETE FROM project_embeddings
       WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?)`
    ).run(userId);

    // 3) Waitlist → cancelled
    const waitlistRes = db
      .prepare(
        `UPDATE waitlist
         SET status = 'cancelled',
             project_description = '[silindi]',
             help_needed = '[silindi]',
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND status IN ('waiting', 'promoted')`
      )
      .run(userId);

    // 4) Refresh tokens → revoke
    const tokensRes = db
      .prepare(
        `UPDATE refresh_tokens SET revoked = 1
         WHERE subject_id = ? AND subject_type = 'user' AND revoked = 0`
      )
      .run(userId);

    // 5) User row → pseudonymize + status=3
    db.prepare(
      `UPDATE users
       SET email = ?,
           full_name = '[Silinen kullanıcı]',
           department = NULL,
           title = NULL,
           manager = NULL,
           phone = NULL,
           bio = NULL,
           project_idea = NULL,
           password_hash = '',
           status = 3,
           failed_login_count = 0,
           locked_until = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(`${pseudo}@purged.local`, userId);

    return {
      deletedBookings: delRes.changes,
      pseudonymizedBookings: pseudonymizeRes.changes,
      cancelledWaitlist: waitlistRes.changes,
      revokedTokens: tokensRes.changes,
      deletedEmbeddings: deletable.length, // approximate count
    };
  });

  const counts = txn();

  recordAudit({
    eventType: 'user.delete',
    subjectId: requestedBy.id,
    subjectType: requestedBy.type,
    success: true,
    details: {
      action: 'data_purge',
      targetUserId: userId,
      ...counts,
    },
  });

  logger.warn('user_data_purge', {
    targetUserId: userId,
    requestedBy: requestedBy.type,
    ...counts,
  });

  return {
    purgedUser: { id: userId, pseudonymizedAs: pseudo },
    ...counts,
  };
}
