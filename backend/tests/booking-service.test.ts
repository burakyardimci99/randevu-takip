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
import { initSchema, closeDb, dbRun, dbOne } from '../src/db/schema';
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
  await initSchema();
  const hash = await argon2.hash('Demo1234!Pass', { type: argon2.argon2id });
  await dbRun(`INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`, [
    USER_A, 'a@test.local', hash, 'User A',
  ]);
  await dbRun(`INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`, [
    USER_B, 'b@test.local', hash, 'User B',
  ]);
  await dbRun(
    `INSERT INTO rooms (id, code, name, district, neighborhood, capacity)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ROOM, 'TX-01', 'Test · Oda', 'Test', 'Mahalle', 4]
  );
});

afterAll(async () => {
  await closeDb();
});

const futureDate = (daysFromNow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

describe('createBooking', () => {
  it('user A için pending booking oluşturur', async () => {
    const result = await createBooking(USER_A, {
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

  it('aynı oda + aynı tarihte ÇAKIŞAN booking reddedilir', async () => {
    await expect(createBooking(USER_B, {
        roomId: ROOM,
        periodMonths: 1,
        startDate: futureDate(8), // existing 7..37, new 8..37 → overlap
        projectName: 'İkinci Proje',
        projectDescription: 'İkinci test booking açıklaması — çakışmalı.',
        helpNeeded: 'Hiçbiri',
        technologies: ['GPT'],
      })).rejects.toThrow(HttpError);
  });

  it('aynı oda + farklı (çakışmayan) tarihte ikinci booking oluşturulabilir', async () => {
    const result = await createBooking(USER_B, {
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
  it("user A, user B'nin booking'ini güncelleyemez", async () => {
    const userBBooking = (await dbOne(
      'SELECT id FROM bookings WHERE user_id = ? LIMIT 1',
      [USER_B]
    )) as { id: string };

    await expect(updateBooking(USER_A, userBBooking.id, {
        roomId: ROOM,
        periodMonths: 1,
        startDate: futureDate(91),
        projectName: 'Çalıntı denemesi',
        projectDescription: 'Bu update başarısız olmalı — IDOR koruması test.',
        helpNeeded: 'Hiçbiri',
        technologies: ['Claude'],
      })).rejects.toThrow(/bulunamadı|BOOKING_NOT_FOUND/i);
  });

  it("user A, user B'nin booking'ini silemez", async () => {
    const userBBooking = (await dbOne(
      'SELECT id FROM bookings WHERE user_id = ? LIMIT 1',
      [USER_B]
    )) as { id: string };

    await expect(deleteBooking(USER_A, userBBooking.id)).rejects.toThrow(/bulunamadı|BOOKING_NOT_FOUND/i);
  });
});

describe('Status kısıtı', () => {
  it('approved booking düzenlenemez', async () => {
    // user A'nın booking'ini approved yap
    const aBooking = (await dbOne(
      'SELECT id FROM bookings WHERE user_id = ? LIMIT 1',
      [USER_A]
    )) as { id: string };
    await dbRun("UPDATE bookings SET status = 'approved' WHERE id = ?", [aBooking.id]);

    await expect(updateBooking(USER_A, aBooking.id, {
        roomId: ROOM,
        periodMonths: 1,
        startDate: futureDate(7),
        projectName: 'Onaylanmış değişmemeli',
        projectDescription: 'Approved booking düzenlenmemeli — status koruması.',
        helpNeeded: 'Hiçbiri',
        technologies: ['Claude'],
      })).rejects.toThrow(/NOT_EDITABLE|düzenlenemez/i);
  });
});
