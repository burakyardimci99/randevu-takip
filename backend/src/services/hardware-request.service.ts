/**
 * Donanım talebi iş akışı.
 *
 * Kullanıcılar mouse / klavye / kamera vb. ekipman talep eder; admin
 * onaylar / reddeder / revize ister. license-request.service'in sade hâli:
 * tek kalem, yönetişim / SLA / katalog yok.
 *
 * Güvenlik (app_security.md):
 * - SQL parameterized (§3)
 * - IDOR: user sadece kendi taleplerini görür/düzenler (§5)
 * - reviewed_by + reviewed_at ile audit-able (§8)
 */
import { nanoid } from 'nanoid';
import { getDb } from '../db/schema';
import { HttpError } from '../middleware/error.middleware';
import {
  pushNotification,
  pushNotificationBulk,
} from './notification-center.service';
import { broadcastToAdmins, broadcastToUser } from './sse.service';

export type HardwareRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'feedback_requested';

export type EquipmentType =
  | 'mouse'
  | 'keyboard'
  | 'camera'
  | 'monitor'
  | 'headset'
  | 'other';

export type HardwareUrgency = 'low' | 'normal' | 'high';

/** Bildirim metinleri için Türkçe ekipman etiketleri. */
const EQUIPMENT_LABEL: Record<EquipmentType, string> = {
  mouse: 'Mouse',
  keyboard: 'Klavye',
  camera: 'Kamera',
  monitor: 'Monitör',
  headset: 'Kulaklık',
  other: 'Diğer donanım',
};

export interface HardwareRequest {
  id: string;
  userId: string;
  equipmentType: EquipmentType;
  equipmentDetail: string | null;
  quantity: number;
  reason: string;
  urgency: HardwareUrgency;
  status: HardwareRequestStatus;
  adminFeedback: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HardwareRequestWithUser extends HardwareRequest {
  userFullName: string;
  userEmail: string;
  userDepartment: string | null;
  reviewerName: string | null;
}

interface DbRow {
  id: string;
  user_id: string;
  equipment_type: EquipmentType;
  equipment_detail: string | null;
  quantity: number;
  reason: string;
  urgency: HardwareUrgency;
  status: HardwareRequestStatus;
  admin_feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DbRowWithUser extends DbRow {
  user_full_name: string;
  user_email: string;
  user_department: string | null;
  reviewer_name: string | null;
}

function rowToHardwareRequest(row: DbRow): HardwareRequest {
  return {
    id: row.id,
    userId: row.user_id,
    equipmentType: row.equipment_type,
    equipmentDetail: row.equipment_detail,
    quantity: row.quantity,
    reason: row.reason,
    urgency: row.urgency,
    status: row.status,
    adminFeedback: row.admin_feedback,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToHardwareRequestWithUser(row: DbRowWithUser): HardwareRequestWithUser {
  return {
    ...rowToHardwareRequest(row),
    userFullName: row.user_full_name,
    userEmail: row.user_email,
    userDepartment: row.user_department,
    reviewerName: row.reviewer_name,
  };
}

/** Admin görünümü — user + reviewer join. reviewed_by admin ya da danışman id. */
const SELECT_ADMIN_REQUEST = `
  SELECT hr.*,
         u.full_name AS user_full_name,
         u.email AS user_email,
         u.department AS user_department,
         COALESCE(ra.full_name, ru.full_name) AS reviewer_name
  FROM hardware_requests hr
  INNER JOIN users u ON u.id = hr.user_id
  LEFT JOIN admins ra ON ra.id = hr.reviewed_by
  LEFT JOIN users ru ON ru.id = hr.reviewed_by
`;

export interface CreateHardwareRequestInput {
  equipmentType: EquipmentType;
  equipmentDetail?: string | null;
  quantity: number;
  reason: string;
  urgency: HardwareUrgency;
}

/* ============================================================
 * USER — talep oluştur / güncelle / kendi taleplerini listele
 * ============================================================ */

export function createHardwareRequest(
  userId: string,
  input: CreateHardwareRequestInput
): HardwareRequest {
  const db = getDb();
  const id = nanoid();

  db.prepare(
    `INSERT INTO hardware_requests
       (id, user_id, equipment_type, equipment_detail, quantity, reason, urgency)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    input.equipmentType,
    input.equipmentDetail?.trim() || null,
    input.quantity,
    input.reason.trim(),
    input.urgency
  );

  const row = db
    .prepare('SELECT * FROM hardware_requests WHERE id = ?')
    .get(id) as DbRow;
  const created = rowToHardwareRequest(row);

  notifyAdminsHardwareRequested(created);

  return created;
}

/**
 * Kullanıcı kendi donanım talebini günceller (IDOR korumalı).
 * Sadece 'pending' / 'feedback_requested' düzenlenebilir; düzenlenince
 * status 'pending'e döner (admin yeniden incelesin).
 */
export function updateHardwareRequest(
  userId: string,
  requestId: string,
  input: CreateHardwareRequestInput
): HardwareRequest {
  const db = getDb();

  const existing = db
    .prepare('SELECT * FROM hardware_requests WHERE id = ?')
    .get(requestId) as DbRow | undefined;

  if (!existing || existing.user_id !== userId) {
    throw new HttpError(404, 'Talep bulunamadı.', 'HARDWARE_REQUEST_NOT_FOUND');
  }
  if (existing.status === 'approved' || existing.status === 'rejected') {
    throw new HttpError(
      400,
      'Sonuçlanmış bir talep düzenlenemez.',
      'HARDWARE_REQUEST_FINALIZED'
    );
  }

  db.prepare(
    `UPDATE hardware_requests SET
       equipment_type = ?, equipment_detail = ?, quantity = ?,
       reason = ?, urgency = ?, status = 'pending',
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(
    input.equipmentType,
    input.equipmentDetail?.trim() || null,
    input.quantity,
    input.reason.trim(),
    input.urgency,
    requestId
  );

  const row = db
    .prepare('SELECT * FROM hardware_requests WHERE id = ?')
    .get(requestId) as DbRow;
  return rowToHardwareRequest(row);
}

export function listUserHardwareRequests(userId: string): HardwareRequest[] {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT * FROM hardware_requests WHERE user_id = ? ORDER BY created_at DESC'
    )
    .all(userId) as DbRow[];
  return rows.map(rowToHardwareRequest);
}

/** Kullanıcının tek talebi (IDOR: sahibi olmalı). */
export function getUserHardwareRequestById(
  userId: string,
  requestId: string
): HardwareRequest | undefined {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM hardware_requests WHERE id = ? AND user_id = ?')
    .get(requestId, userId) as DbRow | undefined;
  return row ? rowToHardwareRequest(row) : undefined;
}

/* ============================================================
 * ADMIN — tüm talepler + review
 * ============================================================ */

export function listAdminHardwareRequests(
  statusFilter?: HardwareRequestStatus
): HardwareRequestWithUser[] {
  const db = getDb();
  const params: unknown[] = [];
  let where = '';
  if (statusFilter) {
    where = 'WHERE hr.status = ?';
    params.push(statusFilter);
  }

  const rows = db
    .prepare(
      `${SELECT_ADMIN_REQUEST}
       ${where}
       ORDER BY
         CASE hr.status
           WHEN 'pending' THEN 0
           WHEN 'feedback_requested' THEN 1
           ELSE 2
         END,
         hr.created_at DESC`
    )
    .all(...params) as DbRowWithUser[];
  return rows.map(rowToHardwareRequestWithUser);
}

export function getAdminHardwareRequestById(
  requestId: string
): HardwareRequestWithUser | undefined {
  const db = getDb();
  const row = db
    .prepare(`${SELECT_ADMIN_REQUEST} WHERE hr.id = ?`)
    .get(requestId) as DbRowWithUser | undefined;
  return row ? rowToHardwareRequestWithUser(row) : undefined;
}

export type HardwareReviewAction = 'approve' | 'reject' | 'request_feedback';

export interface ReviewHardwareRequestInput {
  action: HardwareReviewAction;
  adminFeedback?: string | null;
}

export function reviewHardwareRequest(
  reviewerId: string,
  requestId: string,
  input: ReviewHardwareRequestInput
): HardwareRequestWithUser {
  const db = getDb();

  const existing = db
    .prepare('SELECT * FROM hardware_requests WHERE id = ?')
    .get(requestId) as DbRow | undefined;

  if (!existing) {
    throw new HttpError(404, 'Talep bulunamadı.', 'HARDWARE_REQUEST_NOT_FOUND');
  }
  if (existing.status === 'approved' || existing.status === 'rejected') {
    throw new HttpError(
      400,
      'Bu talep zaten sonuçlandırılmış.',
      'HARDWARE_REQUEST_FINALIZED'
    );
  }

  const nextStatus: HardwareRequestStatus =
    input.action === 'approve'
      ? 'approved'
      : input.action === 'reject'
        ? 'rejected'
        : 'feedback_requested';

  db.prepare(
    `UPDATE hardware_requests SET
       status = ?, admin_feedback = ?, reviewed_by = ?,
       reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(nextStatus, input.adminFeedback?.trim() || null, reviewerId, requestId);

  const result = getAdminHardwareRequestById(requestId)!;
  const label = EQUIPMENT_LABEL[result.equipmentType];

  const notifTitle =
    nextStatus === 'approved'
      ? 'Donanım talebin onaylandı'
      : nextStatus === 'rejected'
        ? 'Donanım talebin reddedildi'
        : 'Donanım talebin için düzeltme istendi';

  pushNotification({
    recipientId: result.userId,
    recipientType: 'user',
    category: 'system',
    title: notifTitle,
    body: `${label} (${result.quantity} adet) — ${
      nextStatus === 'feedback_requested'
        ? 'Taleplerim sayfasından düzenleyebilirsin.'
        : nextStatus === 'approved'
          ? 'talebin onaylandı.'
          : 'detaylar Taleplerim sayfasında.'
    }`,
    link: '/bookings',
  });

  broadcastToUser(result.userId, {
    type: 'hardware_request.reviewed',
    data: { id: requestId, status: nextStatus },
  });

  return result;
}

/* ============================================================
 * BİLDİRİM — yeni talepte admin'lere in-app bildirim + SSE
 * ============================================================ */

function notifyAdminsHardwareRequested(request: HardwareRequest): void {
  const db = getDb();
  const admins = db
    .prepare('SELECT id FROM admins WHERE status = 1')
    .all() as Array<{ id: string }>;

  const submitter = db
    .prepare('SELECT full_name FROM users WHERE id = ?')
    .get(request.userId) as { full_name: string } | undefined;
  const submitterName = submitter?.full_name ?? 'Bir kullanıcı';
  const label = EQUIPMENT_LABEL[request.equipmentType];

  if (admins.length > 0) {
    pushNotificationBulk(
      admins.map((a) => a.id),
      'admin',
      {
        category: 'system',
        title: 'Yeni donanım talebi',
        body: `${submitterName} — ${label} (${request.quantity} adet)`,
        link: '/admin/hardware',
      }
    );
  }

  broadcastToAdmins({
    type: 'hardware_request.created',
    data: { id: request.id },
  });
}
