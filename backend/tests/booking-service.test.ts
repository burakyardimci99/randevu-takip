/**
 * Booking servisi — kritik akış testleri.
 *
 * Test alanı:
 *  - Tarih çakışması (race condition koruması)
 *  - IDOR (user A, user B'nin booking'ini düzenleyemez)
 *  - Status kısıtı (approved booking düzenlenemez/silinemez)
 */
import './setup-env';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { initSchema, closeDb, getDb } from '../src/db/schema';
import {
  createBooking,
  deleteBooking,
  updateBooking,
} from '../src/services/booking.service';
import { HttpError } from '../src/middleware/error.middleware';

const USER_A = nanoid();
const USER_B = nanoid();
const ROOM = nanoid();

beforeAll(async () => {
  initSchema();
  const db = getDb();
  const hash = await argon2.hash('Demo1234!Pass', { type: argon2.argon2id });
  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`
  ).run(USER_A, 'a@test.local', hash, 'User A');
  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`
  ).run(USER_B, 'b@test.local', hash, 'User B');
  db.prepare(
    `INSERT INTO rooms (id, code, name, district, neighborhood, capacity)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(ROOM, 'TX-01', 'Test · Oda', 'Test', 'Mahalle', 4);
});

afterAll(() => {
  closeDb();
});

const futureDate = (daysFromNow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

describe('createBooking', () => {
  it('user A için pending booking oluşturur', () => {
    const result = createBooking(USER_A, {
      roomId: ROOM,
      periodMonths: 1,
      startDate: futureDate(7),
      projectName: 'Test Proje',
      projectDescription: 'Birinci test booking açıklaması yeterli uzunlukta.',
      helpNeeded: 'Hiçbiri',
      technologies: ['Claude'],
    });
    expect(result.status).toBe('pending');
    expect(result.userId).toBe(USER_A);
    expect(result.roomCode).toBe('TX-01');
  });

  it('aynı oda + aynı tarihte ÇAKIŞAN booking reddedilir', () => {
    expect(() =>
      createBooking(USER_B, {
        roomId: ROOM,
        periodMonths: 1,
        startDate: futureDate(8), // existing 7..37, new 8..37 → overlap
        projectName: 'İkinci Proje',
        projectDescription: 'İkinci test booking açıklaması — çakışmalı.',
        helpNeeded: 'Hiçbiri',
        technologies: ['GPT'],
      })
    ).toThrow(HttpError);
  });

  it('aynı oda + farklı (çakışmayan) tarihte ikinci booking oluşturulabilir', () => {
    const result = createBooking(USER_B, {
      roomId: ROOM,
      periodMonths: 1,
      startDate: futureDate(90), // 90..120 — overlap yok
      projectName: 'Gelecek Proje',
      projectDescription: 'Çakışmayan ikinci test booking, farklı zamanda.',
      helpNeeded: 'Hiçbiri',
      technologies: ['React'],
    });
    expect(result.status).toBe('pending');
    expect(result.userId).toBe(USER_B);
  });
});

describe('IDOR koruması', () => {
  it("user A, user B'nin booking'ini güncelleyemez", () => {
    const db = getDb();
    const userBBooking = db
      .prepare('SELECT id FROM bookings WHERE user_id = ? LIMIT 1')
      .get(USER_B) as { id: string };

    expect(() =>
      updateBooking(USER_A, userBBooking.id, {
        roomId: ROOM,
        periodMonths: 1,
        startDate: futureDate(91),
        projectName: 'Çalıntı denemesi',
        projectDescription: 'Bu update başarısız olmalı — IDOR koruması test.',
        helpNeeded: 'Hiçbiri',
        technologies: ['Claude'],
      })
    ).toThrow(/bulunamadı|BOOKING_NOT_FOUND/i);
  });

  it("user A, user B'nin booking'ini silemez", () => {
    const db = getDb();
    const userBBooking = db
      .prepare('SELECT id FROM bookings WHERE user_id = ? LIMIT 1')
      .get(USER_B) as { id: string };

    expect(() => deleteBooking(USER_A, userBBooking.id)).toThrow(
      /bulunamadı|BOOKING_NOT_FOUND/i
    );
  });
});

describe('Status kısıtı', () => {
  it('approved booking düzenlenemez', () => {
    const db = getDb();
    // user A'nın booking'ini approved yap
    const aBooking = db
      .prepare('SELECT id FROM bookings WHERE user_id = ? LIMIT 1')
      .get(USER_A) as { id: string };
    db.prepare("UPDATE bookings SET status = 'approved' WHERE id = ?").run(aBooking.id);

    expect(() =>
      updateBooking(USER_A, aBooking.id, {
        roomId: ROOM,
        periodMonths: 1,
        startDate: futureDate(7),
        projectName: 'Onaylanmış değişmemeli',
        projectDescription: 'Approved booking düzenlenmemeli — status koruması.',
        helpNeeded: 'Hiçbiri',
        technologies: ['Claude'],
      })
    ).toThrow(/NOT_EDITABLE|düzenlenemez/i);
  });
});
