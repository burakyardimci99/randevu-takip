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
import { initSchema, closeDb, dbRun, dbOne } from '../src/db/schema';
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
  await initSchema();
  const hash = await argon2.hash('Demo1234!Pass', { type: argon2.argon2id });
  await dbRun(`INSERT OR IGNORE INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`, [USER_A, 'wa-a@test.local', hash, 'WL User A']);
  await dbRun(`INSERT OR IGNORE INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`, [USER_B, 'wa-b@test.local', hash, 'WL User B']);
  await dbRun(`INSERT OR IGNORE INTO rooms (id, code, name, district, neighborhood, capacity) VALUES (?, ?, ?, ?, ?, ?)`, [ROOM, 'WL-01', 'WL Oda', 'Test', 'Mahalle', 4]);

  // Bloklayıcı booking — 7 gün sonra başlar, ~37 gün sonra biter
  await dbRun(
    `INSERT INTO bookings (id, user_id, room_id, period_months, start_date, end_date,
       project_name, project_description, help_needed, technologies, status)
     VALUES (?, ?, ?, 1, ?, ?, 'Blok', 'Bloklayıcı booking — waitlist test için.', 'yok', '["X"]', 'approved')`,
    [BLOCKING_BOOKING, USER_A, ROOM, futureDate(7), futureDate(36)]
  );
});

afterAll(async () => {
  await closeDb();
});

describe('joinWaitlist', () => {
  it('müsait olan oda için sıraya yazılamaz (room available)', async () => {
    await expect(joinWaitlist(USER_B, {
        roomId: ROOM,
        periodMonths: 1,
        desiredStartDate: futureDate(120), // tamamen boş zaman aralığı
        projectName: 'Waitlist test boş',
        projectDescription: 'Bu istek başarısız olmalı çünkü tarih aralığı boş.',
        helpNeeded: 'Yok',
        technologies: ['Claude'],
      })).rejects.toThrow(/ROOM_AVAILABLE|müsait/i);
  });

  it('dolu zaman aralığı için kullanıcı sıraya yazılır (position 1)', async () => {
    const entry = await joinWaitlist(USER_B, {
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

  it('aynı user aynı oda+tarih için ikinci entry açamaz', async () => {
    await expect(joinWaitlist(USER_B, {
        roomId: ROOM,
        periodMonths: 1,
        desiredStartDate: futureDate(10),
        projectName: 'Duplicate',
        projectDescription: 'İkinci kez sıraya yazılma denemesi — başarısız olmalı.',
        helpNeeded: 'Yok',
        technologies: ['GPT'],
      })).rejects.toThrow(/ALREADY_JOINED|zaten/i);
  });
});

describe('tryPromoteForRoom', () => {
  it('bloklayıcı booking silinirse waitlist head promote olur', async () => {
    // Bloklayıcı booking'i sil
    await dbRun('DELETE FROM bookings WHERE id = ?', [BLOCKING_BOOKING]);

    const promoted = await tryPromoteForRoom(ROOM);
    expect(promoted.length).toBeGreaterThanOrEqual(1);

    // User B'nin waitlist entry'si artık 'promoted'
    const entries = await listUserWaitlist(USER_B);
    const myEntry = entries.find((e) => e.roomCode === 'WL-01');
    expect(myEntry?.status).toBe('promoted');
    expect(myEntry?.promotedBookingId).toBeTruthy();

    // Yeni booking gerçekten oluştu mu?
    const newBooking = (await dbOne(
      `SELECT id, user_id, status FROM bookings WHERE id = ?`,
      [myEntry!.promotedBookingId!]
    )) as { id: string; user_id: string; status: string } | undefined;
    expect(newBooking).toBeDefined();
    expect(newBooking?.user_id).toBe(USER_B);
    expect(newBooking?.status).toBe('pending');
  });
});

void HttpError;
