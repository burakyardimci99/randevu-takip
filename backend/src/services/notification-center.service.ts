/**
 * In-app bildirim merkezi servisi.
 *
 * E-posta bildirimlerinden (notification.service.ts) AYRI: bu servis
 * uygulama içi kalıcı bildirimleri yönetir (header zil + popover).
 *
 * Tasarım:
 *  - SSE anlık iletim sağlar; bu tablo kalıcılık sağlar.
 *  - Her bildirim bir alıcıya (user/admin) aittir — IDOR: alıcı sadece
 *    kendi bildirimlerini görür/işaretler.
 *  - pushNotification best-effort: bildirim yazımı başarısız olsa bile
 *    asıl işlem (review, create vb.) etkilenmez.
 */
import { nanoid } from 'nanoid';
import { getDb } from '../db/schema';
import { logger } from '../utils/logger';

export type NotificationCategory =
  | 'booking'
  | 'license'
  | 'waitlist'
  | 'message'
  | 'system';

export type RecipientType = 'user' | 'admin';

export interface Notification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface DbRow {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link: string | null;
  read: number;
  created_at: string;
}

function rowToNotification(row: DbRow): Notification {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    link: row.link,
    read: row.read === 1,
    createdAt: row.created_at,
  };
}

export interface PushNotificationInput {
  recipientId: string;
  recipientType: RecipientType;
  category: NotificationCategory;
  title: string;
  body: string;
  link?: string | null;
}

/**
 * Tek bir alıcıya bildirim oluşturur. Best-effort — hata fırlatmaz.
 */
export function pushNotification(input: PushNotificationInput): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO notifications
         (id, recipient_id, recipient_type, category, title, body, link)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      nanoid(),
      input.recipientId,
      input.recipientType,
      input.category,
      input.title.slice(0, 200),
      input.body.slice(0, 500),
      input.link ?? null
    );
  } catch (err) {
    logger.error('notification_push_failed', { err: (err as Error).message });
  }
}

/**
 * Birden çok alıcıya aynı bildirimi gönderir (örn. tüm admin'ler).
 */
export function pushNotificationBulk(
  recipientIds: string[],
  recipientType: RecipientType,
  payload: Omit<PushNotificationInput, 'recipientId' | 'recipientType'>
): void {
  for (const id of recipientIds) {
    pushNotification({ ...payload, recipientId: id, recipientType });
  }
}

export function listNotifications(
  recipientId: string,
  recipientType: RecipientType,
  limit = 30
): Notification[] {
  const db = getDb();
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const rows = db
    .prepare(
      `SELECT id, category, title, body, link, read, created_at
       FROM notifications
       WHERE recipient_id = ? AND recipient_type = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(recipientId, recipientType, safeLimit) as DbRow[];
  return rows.map(rowToNotification);
}

export function countUnreadNotifications(
  recipientId: string,
  recipientType: RecipientType
): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM notifications
       WHERE recipient_id = ? AND recipient_type = ? AND read = 0`
    )
    .get(recipientId, recipientType) as { c: number };
  return row.c;
}

/**
 * Tek bildirimi okundu işaretler. IDOR: sadece kendi bildirimini.
 */
export function markNotificationRead(
  recipientId: string,
  recipientType: RecipientType,
  notificationId: string
): void {
  const db = getDb();
  db.prepare(
    `UPDATE notifications SET read = 1
     WHERE id = ? AND recipient_id = ? AND recipient_type = ?`
  ).run(notificationId, recipientId, recipientType);
}

/**
 * Alıcının tüm bildirimlerini okundu işaretler.
 */
export function markAllNotificationsRead(
  recipientId: string,
  recipientType: RecipientType
): number {
  const db = getDb();
  const res = db
    .prepare(
      `UPDATE notifications SET read = 1
       WHERE recipient_id = ? AND recipient_type = ? AND read = 0`
    )
    .run(recipientId, recipientType);
  return res.changes;
}
