/**
 * Waitlist servisi — sıraya yazılma + promote akışı testleri.
 *
 * Kapsam:
 *  - Müsait odaya sıraya yazılamaz (WAITLIST_ROOM_AVAILABLE)
 *  - Aynı user aynı oda+tarih için 1 entry (idempotent koruma)
 *  - Çatışma kaldırıldığında auto-promote → pending booking oluşturur
 */
import './setup-env';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { initSchema, closeDb, getDb } from '../src/db/schema';
import {
  joinWaitlist,
  tryPromoteForRoom,
  listUserWaitlist,
} from '../src/services/waitlist.service';
import { HttpError } from '../src/middleware/error.middleware';

const USER_A = nanoid();
const USER_B = nanoid();
const ROOM = nanoid();
const BLOCKING_BOOKING = nanoid();

const futureDate = (daysFromNow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  initSchema();
  const db = getDb();
  const hash = await argon2.hash('Demo1234!Pass', { type: argon2.argon2id });
  db.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`).run(USER_A, 'wa-a@test.local', hash, 'WL User A');
  db.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`).run(USER_B, 'wa-b@test.local', hash, 'WL User B');
  db.prepare(`INSERT OR IGNORE INTO rooms (id, code, name, district, neighborhood, capacity) VALUES (?, ?, ?, ?, ?, ?)`).run(ROOM, 'WL-01', 'WL Oda', 'Test', 'Mahalle', 4);

  // Bloklayıcı booking — 7 gün sonra başlar, ~37 gün sonra biter
  db.prepare(
    `INSERT INTO bookings (id, user_id, room_id, period_months, start_date, end_date,
       project_name, project_description, help_needed, technologies, status)
     VALUES (?, ?, ?, 1, ?, ?, 'Blok', 'Bloklayıcı booking — waitlist test için.', 'yok', '["X"]', 'approved')`
  ).run(BLOCKING_BOOKING, USER_A, ROOM, futureDate(7), futureDate(36));
});

afterAll(() => {
  closeDb();
});

describe('joinWaitlist', () => {
  it('müsait olan oda için sıraya yazılamaz (room available)', () => {
    expect(() =>
      joinWaitlist(USER_B, {
        roomId: ROOM,
        periodMonths: 1,
        desiredStartDate: futureDate(120), // tamamen boş zaman aralığı
        projectName: 'Waitlist test boş',
        projectDescription: 'Bu istek başarısız olmalı çünkü tarih aralığı boş.',
        helpNeeded: 'Yok',
        technologies: ['Claude'],
      })
    ).toThrow(/ROOM_AVAILABLE|müsait/i);
  });

  it('dolu zaman aralığı için kullanıcı sıraya yazılır (position 1)', () => {
    const entry = joinWaitlist(USER_B, {
      roomId: ROOM,
      periodMonths: 1,
      desiredStartDate: futureDate(10), // bloklayıcı booking ile çakışır
      projectName: 'Waitlist test dolu',
      projectDescription: 'Bu istek başarılı olmalı — oda dolu, sıraya gir.',
      helpNeeded: 'Yok',
      technologies: ['GPT'],
    });
    expect(entry.status).toBe('waiting');
    expect(entry.position).toBe(1);
    expect(entry.userId).toBe(USER_B);
  });

  it('aynı user aynı oda+tarih için ikinci entry açamaz', () => {
    expect(() =>
      joinWaitlist(USER_B, {
        roomId: ROOM,
        periodMonths: 1,
        desiredStartDate: futureDate(10),
        projectName: 'Duplicate',
        projectDescription: 'İkinci kez sıraya yazılma denemesi — başarısız olmalı.',
        helpNeeded: 'Yok',
        technologies: ['GPT'],
      })
    ).toThrow(/ALREADY_JOINED|zaten/i);
  });
});

describe('tryPromoteForRoom', () => {
  it('bloklayıcı booking silinirse waitlist head promote olur', async () => {
    const db = getDb();
    // Bloklayıcı booking'i sil
    db.prepare('DELETE FROM bookings WHERE id = ?').run(BLOCKING_BOOKING);

    const promoted = await tryPromoteForRoom(ROOM);
    expect(promoted.length).toBeGreaterThanOrEqual(1);

    // User B'nin waitlist entry'si artık 'promoted'
    const entries = listUserWaitlist(USER_B);
    const myEntry = entries.find((e) => e.roomCode === 'WL-01');
    expect(myEntry?.status).toBe('promoted');
    expect(myEntry?.promotedBookingId).toBeTruthy();

    // Yeni booking gerçekten oluştu mu?
    const newBooking = db
      .prepare(`SELECT id, user_id, status FROM bookings WHERE id = ?`)
      .get(myEntry!.promotedBookingId!) as
      | { id: string; user_id: string; status: string }
      | undefined;
    expect(newBooking).toBeDefined();
    expect(newBooking?.user_id).toBe(USER_B);
    expect(newBooking?.status).toBe('pending');
  });
});

void HttpError;
