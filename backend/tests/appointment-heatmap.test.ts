/**
 * getRoomAppointmentHeatmap — appointment (saatli) ısı-haritası testleri (#5/#6).
 *
 * Doğrular:
 *  - Belirli tarih aralığında oda × gün randevu sayıları doğru hesaplanır.
 *  - Hücre `slots` saatli detayı (start/end/title/user) içerir.
 *  - weekday (Pzt=1..Paz=7) doğru atanır.
 *  - Aralık dışındaki randevular sayılmaz.
 */
import './setup-env';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { initSchema, closeDb, dbRun } from '../src/db/schema';
import { getRoomAppointmentHeatmap } from '../src/services/appointment.service';

const USER = nanoid();
const ROOM = nanoid();
const BOOKING = nanoid();

async function insertAppointment(id: string, startAt: string, endAt: string, title: string) {
  await dbRun(
    `INSERT INTO appointments
       (id, booking_id, user_id, room_id, start_at, end_at, title, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, '', 'scheduled')`,
    [id, BOOKING, USER, ROOM, startAt, endAt, title]
  );
}

beforeAll(async () => {
  await initSchema();
  const hash = await argon2.hash('Demo1234!Pass', { type: argon2.argon2id });
  await dbRun(`INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`, [
    USER, 'heatmap-user@test.local', hash, 'Heatmap User',
  ]);
  await dbRun(
    `INSERT INTO rooms (id, code, name, district, neighborhood, capacity)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ROOM, 'HM-01', 'Heatmap · Oda', 'Test', 'Mahalle', 4]
  );
  await dbRun(
    `INSERT INTO bookings
       (id, user_id, room_id, period_months, start_date, end_date, status,
        project_name, project_description, help_needed, technologies)
     VALUES (?, ?, ?, 1, '2026-06-01', '2026-06-30', 'approved', 'HM Proje',
        'Isı haritası test açıklaması yeterli uzunlukta.', 'Hiçbiri', ?)`,
    [BOOKING, USER, ROOM, JSON.stringify(['Claude'])]
  );
  // 2026-06-03 (Çarşamba=3): iki randevu. 2026-06-05 (Cuma=5): bir randevu.
  await insertAppointment(nanoid(), '2026-06-03T13:00:00.000Z', '2026-06-03T14:00:00.000Z', 'Sabah blok');
  await insertAppointment(nanoid(), '2026-06-03T16:00:00.000Z', '2026-06-03T17:30:00.000Z', 'Öğleden sonra');
  await insertAppointment(nanoid(), '2026-06-05T09:00:00.000Z', '2026-06-05T10:00:00.000Z', 'Cuma blok');
  // Aralık dışı (sayılmamalı):
  await insertAppointment(nanoid(), '2026-07-10T09:00:00.000Z', '2026-07-10T10:00:00.000Z', 'Gelecek ay');
});

afterAll(async () => {
  await closeDb();
});

describe('getRoomAppointmentHeatmap', () => {
  it('aralıktaki randevuları oda × gün sayar, slots saatli detay içerir', async () => {
    const res = await getRoomAppointmentHeatmap({ from: '2026-06-01', to: '2026-06-07' });
    expect(res.from).toBe('2026-06-01');
    expect(res.to).toBe('2026-06-07');
    expect(res.maxCount).toBe(2); // Çarşamba 2 randevu

    const room = res.rooms.find((r) => r.roomId === ROOM);
    expect(room).toBeDefined();
    expect(room!.days).toHaveLength(7); // Pzt..Paz

    const wed = room!.days.find((d) => d.date === '2026-06-03');
    expect(wed?.weekday).toBe(3); // Çarşamba
    expect(wed?.count).toBe(2);
    expect(wed?.slots).toHaveLength(2);
    expect(wed?.slots.map((s) => s.title)).toContain('Sabah blok');
    expect(wed?.slots[0].user).toBe('Heatmap User');

    const fri = room!.days.find((d) => d.date === '2026-06-05');
    expect(fri?.weekday).toBe(5);
    expect(fri?.count).toBe(1);

    expect(room!.total).toBe(3); // aralıkta 3 randevu (temmuz hariç)
  });

  it('aralık dışındaki randevuları saymaz', async () => {
    const res = await getRoomAppointmentHeatmap({ from: '2026-06-01', to: '2026-06-07' });
    const room = res.rooms.find((r) => r.roomId === ROOM);
    const hasJuly = room!.days.some((d) => d.date.startsWith('2026-07'));
    expect(hasJuly).toBe(false);
  });
});
