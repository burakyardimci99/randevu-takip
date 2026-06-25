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
  reviewBooking,
  getBookingByIdAdmin,
} from '../src/services/booking.service';
import { addMonthsEndDate } from '../src/utils/dates';
import { createBookingSchema } from '../src/validators/schemas';
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

  it('çakışma hatası "ne zamana kadar dolu" + en erken müsait tarihi içerir', async () => {
    try {
      await createBooking(USER_B, {
        roomId: ROOM,
        periodMonths: 1,
        startDate: futureDate(8),
        projectName: 'Çakışan Proje',
        projectDescription: 'Çakışma mesajını doğrulayan test booking açıklaması.',
        helpNeeded: 'Hiçbiri',
        technologies: ['GPT'],
      });
      throw new Error('beklenmeyen: çakışma hatası fırlatmadı');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      const msg = (e as HttpError).message;
      expect(msg).toMatch(/dolu/i);
      expect(msg).toMatch(/En erken/i); // en erken müsait tarih bilgisi
      expect(msg).toMatch(/\d{2}\.\d{2}\.\d{4}/); // DD.MM.YYYY tarih(ler)i
    }
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

describe('çift onay (admin + analitik, paralel, veto)', () => {
  const DA_ROOM = nanoid();
  const ADMIN_ID = nanoid();
  const ANALYST_ID = nanoid();

  beforeAll(async () => {
    await dbRun(`INSERT INTO rooms (id, code, name, district, neighborhood, capacity) VALUES (?, ?, ?, 'T','M',4)`, [
      DA_ROOM, 'DA-01', 'Dual Onay Oda',
    ]);
  });

  async function makeBooking(startOffset: number): Promise<string> {
    const b = await createBooking(USER_A, {
      roomId: DA_ROOM,
      periodMonths: 1,
      startDate: futureDate(startOffset),
      projectName: 'Çift onay projesi',
      projectDescription: 'Çift onay senaryosu için yeterli uzunlukta açıklama metni.',
      helpNeeded: 'Yok',
      technologies: ['Claude'],
    });
    return b.id;
  }

  it('admin önce onaylar → pending; sonra analitik onaylar → approved', async () => {
    const id = await makeBooking(10);
    const r1 = await reviewBooking(ADMIN_ID, id, { action: 'approve' }, 'admin');
    expect(r1.booking.status).toBe('pending');
    expect(r1.approvalState.adminDecision).toBe('approved');
    expect(r1.approvalState.analystDecision).toBeNull();

    const r2 = await reviewBooking(ANALYST_ID, id, { action: 'approve' }, 'danisman');
    expect(r2.booking.status).toBe('approved');
    expect(r2.booking.lifecycleStage).toBe('development');
    expect(r2.approvalState.adminDecision).toBe('approved');
    expect(r2.approvalState.analystDecision).toBe('approved');
  });

  it('paralel: analitik önce onaylasa da ikisi tamamlanınca approved', async () => {
    const id = await makeBooking(60);
    const r1 = await reviewBooking(ANALYST_ID, id, { action: 'approve' }, 'danisman');
    expect(r1.booking.status).toBe('pending');
    expect(r1.approvalState.analystDecision).toBe('approved');

    const r2 = await reviewBooking(ADMIN_ID, id, { action: 'approve' }, 'admin');
    expect(r2.booking.status).toBe('approved');
  });

  it('veto: admin onaylasa bile analitik reddederse anında rejected', async () => {
    const id = await makeBooking(110);
    await reviewBooking(ADMIN_ID, id, { action: 'approve' }, 'admin');
    const r2 = await reviewBooking(ANALYST_ID, id, { action: 'reject' }, 'danisman');
    expect(r2.booking.status).toBe('rejected');
    expect(r2.approvalState.analystDecision).toBe('rejected');
  });

  it('request_feedback her iki kararı sıfırlar', async () => {
    const id = await makeBooking(160);
    await reviewBooking(ADMIN_ID, id, { action: 'approve' }, 'admin');
    const r2 = await reviewBooking(ANALYST_ID, id, { action: 'request_feedback', feedback: 'Lütfen kapsamı netleştirin.' }, 'danisman');
    expect(r2.booking.status).toBe('feedback_requested');
    expect(r2.approvalState.adminDecision).toBeNull();
    expect(r2.approvalState.analystDecision).toBeNull();
  });

  it('sonuçlanmış talep tekrar incelenemez (BOOKING_NOT_REVIEWABLE)', async () => {
    const id = await makeBooking(210);
    await reviewBooking(ADMIN_ID, id, { action: 'approve' }, 'admin');
    await reviewBooking(ANALYST_ID, id, { action: 'approve' }, 'danisman'); // approved
    await expect(
      reviewBooking(ADMIN_ID, id, { action: 'reject' }, 'admin')
    ).rejects.toThrow(/sonuçlandırılmış|NOT_REVIEWABLE/i);
    // Onaylı kalmalı.
    const after = await getBookingByIdAdmin(id);
    expect(after?.status).toBe('approved');
  });
});

describe('esnek/kısa süreli randevu (manuel endDate)', () => {
  const ROOM_FX = nanoid();
  beforeAll(async () => {
    await dbRun(`INSERT INTO rooms (id, code, name, district, neighborhood, capacity) VALUES (?, ?, 'Esnek','T','M',4)`, [
      ROOM_FX, 'FX-01',
    ]);
  });

  it('manuel kısa bitiş kullanılır (periyot-türevi yerine)', async () => {
    const start = futureDate(5);
    const shortEnd = futureDate(12); // ~1 hafta, 1 aydan kısa
    const b = await createBooking(USER_A, {
      roomId: ROOM_FX,
      periodMonths: 1,
      startDate: start,
      endDate: shortEnd,
      projectName: 'Kısa süreli iş',
      projectDescription: 'Bir haftalık kısa süreli randevu testi açıklaması.',
      helpNeeded: 'Yok',
      technologies: ['Claude'],
    });
    expect(b.endDate).toBe(shortEnd);
    expect(b.endDate < addMonthsEndDate(start, 1)).toBe(true); // periyottan kısa
  });

  it('manuel bitiş yoksa periyottan türetilir', async () => {
    const start = futureDate(120);
    const b = await createBooking(USER_A, {
      roomId: ROOM_FX,
      periodMonths: 2,
      startDate: start,
      projectName: 'Standart süre',
      projectDescription: 'Manuel bitiş verilmeyen standart periyot testi açıklaması.',
      helpNeeded: 'Yok',
      technologies: ['Claude'],
    });
    expect(b.endDate).toBe(addMonthsEndDate(start, 2));
  });

  it('validator: bitiş başlangıçtan önce olamaz', () => {
    const res = createBookingSchema.safeParse({
      roomId: 'x'.repeat(10),
      periodMonths: 1,
      startDate: '2026-08-10',
      endDate: '2026-08-05', // başlangıçtan önce
      projectName: 'Ters tarih',
      projectDescription: 'Bitiş başlangıçtan önce — reddedilmeli, yeterli uzunlukta.',
      helpNeeded: 'Yardım gerek.',
      technologies: ['Claude'],
    });
    expect(res.success).toBe(false);
  });

  it('validator: periyot dışı UZUN bitiş kabul edilir (üst sınır yok)', () => {
    const res = createBookingSchema.safeParse({
      roomId: 'x'.repeat(10),
      periodMonths: 1,
      startDate: '2026-08-10',
      endDate: '2027-02-10', // 1 ay periyot ama 6 ay bitiş → serbest
      projectName: 'Uzun süre',
      projectDescription: 'Periyottan uzun ama üst sınır yok — kabul, yeterli uzunlukta.',
      helpNeeded: 'Yardım gerek.',
      technologies: ['Claude'],
    });
    expect(res.success).toBe(true);
  });
});
