/**
 * Booking mesajlaşma thread servisi.
 *
 * Her booking için admin <-> user mesajlaşma kanalı.
 * - User sadece kendi booking'ine yazabilir (IDOR koruması, app_security §5).
 * - Admin tüm booking'lere yazabilir.
 * - SSE ile karşı tarafa anlık event.
 * - Audit log: her mesajı 'message.sent' event ile kaydet.
 *
 * Güvenlik:
 * - body Zod ile validate (uzunluk + trim).
 * - Yazar tipi server tarafında belirlenir (client'tan trust edilmez).
 * - Parameterized SQL.
 */
import { nanoid } from 'nanoid';
import { getDb } from '../db/schema';
import { HttpError } from '../middleware/error.middleware';
import { broadcastBooking } from './sse.service';
import { recordAudit } from './audit.service';

export interface BookingMessage {
  id: string;
  bookingId: string;
  authorId: string;
  authorType: 'user' | 'admin';
  authorName: string;
  body: string;
  readByRecipient: boolean;
  createdAt: string;
}

interface MessageRow {
  id: string;
  booking_id: string;
  author_id: string;
  author_type: 'user' | 'admin';
  author_name: string;
  body: string;
  read_by_recipient: number;
  created_at: string;
}

function rowToDto(r: MessageRow): BookingMessage {
  return {
    id: r.id,
    bookingId: r.booking_id,
    authorId: r.author_id,
    authorType: r.author_type,
    authorName: r.author_name,
    body: r.body,
    readByRecipient: r.read_by_recipient === 1,
    createdAt: r.created_at,
  };
}

/** Verilen booking'in tüm mesajlarını döner (eski → yeni sıralı). */
export function listMessages(bookingId: string): BookingMessage[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM booking_messages WHERE booking_id = ? ORDER BY created_at ASC`
    )
    .all(bookingId) as MessageRow[];
  return rows.map(rowToDto);
}

/** Bir kullanıcının booking'ine ait mesaj sayısı + okunmamış sayısı. */
export function getThreadMeta(
  bookingId: string,
  viewerType: 'user' | 'admin'
): { total: number; unread: number } {
  const db = getDb();
  const total = (
    db.prepare('SELECT COUNT(*) AS c FROM booking_messages WHERE booking_id = ?').get(bookingId) as {
      c: number;
    }
  ).c;
  // unread: gönderen viewer DEĞİL + read_by_recipient = 0
  const otherType = viewerType === 'user' ? 'admin' : 'user';
  const unread = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM booking_messages
         WHERE booking_id = ? AND author_type = ? AND read_by_recipient = 0`
      )
      .get(bookingId, otherType) as { c: number }
  ).c;
  return { total, unread };
}

export interface PostMessageInput {
  bookingId: string;
  authorId: string;
  authorType: 'user' | 'admin';
  authorName: string;
  body: string;
}

export function postMessage(input: PostMessageInput): BookingMessage {
  const db = getDb();
  const body = input.body.trim();
  if (body.length < 1 || body.length > 2000) {
    throw new HttpError(400, 'Mesaj en az 1 en fazla 2000 karakter olmalı.', 'VALIDATION');
  }

  // Booking var mı + author authorization?
  const booking = db
    .prepare(`SELECT id, user_id FROM bookings WHERE id = ?`)
    .get(input.bookingId) as { id: string; user_id: string } | undefined;
  if (!booking) {
    throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
  }
  if (input.authorType === 'user' && booking.user_id !== input.authorId) {
    throw new HttpError(403, 'Bu booking üzerinde yetkiniz yok.', 'FORBIDDEN');
  }

  const id = nanoid();
  db.prepare(
    `INSERT INTO booking_messages (id, booking_id, author_id, author_type, author_name, body)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, input.bookingId, input.authorId, input.authorType, input.authorName, body);

  const message = db
    .prepare(`SELECT * FROM booking_messages WHERE id = ?`)
    .get(id) as MessageRow;

  // SSE — booking sahibi + adminlere
  broadcastBooking(
    {
      type: 'booking.updated',
      data: { bookingId: input.bookingId, kind: 'new_message', authorType: input.authorType },
    },
    booking.user_id
  );

  recordAudit({
    eventType: 'message.sent',
    subjectId: input.authorId,
    subjectType: input.authorType,
    success: true,
    details: { bookingId: input.bookingId, length: body.length },
  });

  return rowToDto(message);
}

/**
 * Karşı tarafın gönderdiği mesajları "okundu" işaretle.
 * Mesaj sahibinin (author_type !== viewer) tüm read=0 mesajları read=1 olur.
 */
export function markThreadRead(bookingId: string, viewerType: 'user' | 'admin'): { updated: number } {
  const db = getDb();
  const otherType = viewerType === 'user' ? 'admin' : 'user';
  const res = db
    .prepare(
      `UPDATE booking_messages
       SET read_by_recipient = 1
       WHERE booking_id = ? AND author_type = ? AND read_by_recipient = 0`
    )
    .run(bookingId, otherType);
  return { updated: res.changes };
}

/**
 * Kullanıcının tüm okunmamış mesaj sayısı (bildirim için).
 */
export function getUnreadCountForUser(userId: string): number {
  return (
    getDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM booking_messages bm
         INNER JOIN bookings b ON b.id = bm.booking_id
         WHERE b.user_id = ? AND bm.author_type = 'admin' AND bm.read_by_recipient = 0`
      )
      .get(userId) as { c: number }
  ).c;
}

/**
 * Admin için: tüm bookings'de cevap bekleyen okunmamış mesaj sayısı.
 */
export function getUnreadCountForAdmin(): number {
  return (
    getDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM booking_messages
         WHERE author_type = 'user' AND read_by_recipient = 0`
      )
      .get() as { c: number }
  ).c;
}
