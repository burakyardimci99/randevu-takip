/**
 * Oda (room) servisi — liste, uygunluk ve doluluk testleri.
 *
 * Kapsam:
 *  - listRooms(): yalnız aktif odaları döner (is_active=0 hariç).
 *  - listRooms(date): tarih filtreli uygunluk — o günü kapsayan booking varsa dolu.
 *  - getRoomsWithOccupancy(): odanın aktif booking'lerini sayar (approved/pending).
 */
import './setup-env';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { initSchema, closeDb, dbRun } from '../src/db/schema';
import { listRooms, getRoomsWithOccupancy } from '../src/services/room.service';

const USER = nanoid();
const ACTIVE_ROOM = nanoid();
const INACTIVE_ROOM = nanoid();
const BOOKED_ROOM = nanoid();
const ACTIVE_CODE = `RA-${nanoid(4).toUpperCase()}`;
const INACTIVE_CODE = `RI-${nanoid(4).toUpperCase()}`;
const BOOKED_CODE = `RB-${nanoid(4).toUpperCase()}`;

const futureDate = (daysFromNow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};
// Bugünü kapsayan aralık — listRooms(date) ve doluluk için.
const todayStr = new Date().toISOString().slice(0, 10);
const pastDate = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  await initSchema();
  const hash = await argon2.hash('Demo1234!Pass', { type: argon2.argon2id });
  await dbRun(`INSERT OR IGNORE INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`, [
    USER, `room-${nanoid(6)}@test.local`, hash, 'Room Tester',
  ]);

  await dbRun(`INSERT INTO rooms (id, code, name, district, neighborhood, capacity, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)`, [
    ACTIVE_ROOM, ACTIVE_CODE, 'Aktif Oda', 'Test', 'Mahalle', 4,
  ]);
  await dbRun(`INSERT INTO rooms (id, code, name, district, neighborhood, capacity, is_active) VALUES (?, ?, ?, ?, ?, ?, 0)`, [
    INACTIVE_ROOM, INACTIVE_CODE, 'Pasif Oda', 'Test', 'Mahalle', 4,
  ]);
  await dbRun(`INSERT INTO rooms (id, code, name, district, neighborhood, capacity, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)`, [
    BOOKED_ROOM, BOOKED_CODE, 'Dolu Oda', 'Test', 'Mahalle', 4,
  ]);

  // BOOKED_ROOM: bugünü kapsayan, tüm hafta dolu (mask 127) approved booking.
  await dbRun(
    `INSERT INTO bookings (id, user_id, room_id, period_months, start_date, end_date,
       project_name, project_description, help_needed, technologies, weekday_mask, status)
     VALUES (?, ?, ?, 1, ?, ?, 'Dolu Proje', 'Bugünü kapsayan tam-hafta booking — oda dolu.', 'yok', '["X"]', 127, 'approved')`,
    [nanoid(), USER, BOOKED_ROOM, pastDate(2), futureDate(30)]
  );
});

afterAll(async () => {
  await closeDb();
});

describe('listRooms', () => {
  it('yalnız aktif odaları döner (pasif oda listede yok)', async () => {
    const rooms = await listRooms();
    const codes = rooms.map((r) => r.code);
    expect(codes).toContain(ACTIVE_CODE);
    expect(codes).toContain(BOOKED_CODE);
    expect(codes).not.toContain(INACTIVE_CODE);
  });

  it('booking olmayan aktif oda müsait (isAvailable=true)', async () => {
    const rooms = await listRooms();
    const active = rooms.find((r) => r.code === ACTIVE_CODE);
    expect(active).toBeDefined();
    expect(active!.isAvailable).toBe(true);
  });

  it('bugünü kapsayan tam-hafta booking olan oda müsait değil (isAvailable=false)', async () => {
    const rooms = await listRooms();
    const booked = rooms.find((r) => r.code === BOOKED_CODE);
    expect(booked).toBeDefined();
    expect(booked!.isAvailable).toBe(false);
    expect(booked!.nextAvailableDate).toBeTruthy();
  });

  it('tarih filtresi: dolu odanın o tarihte müsait olmadığını döner', async () => {
    const rooms = await listRooms(todayStr);
    const booked = rooms.find((r) => r.code === BOOKED_CODE);
    const active = rooms.find((r) => r.code === ACTIVE_CODE);
    expect(booked!.isAvailable).toBe(false);
    expect(active!.isAvailable).toBe(true);
  });

  it('tarih filtresi: booking aralığı dışındaki bir tarihte oda müsait', async () => {
    // 200 gün sonra hiçbir booking yok.
    const rooms = await listRooms(futureDate(200));
    const booked = rooms.find((r) => r.code === BOOKED_CODE);
    expect(booked!.isAvailable).toBe(true);
  });
});

describe('getRoomsWithOccupancy', () => {
  it('dolu odanın aktif booking sayımını döner (approvedCount >= 1)', async () => {
    const rooms = await getRoomsWithOccupancy();
    const booked = rooms.find((r) => r.code === BOOKED_CODE);
    expect(booked).toBeDefined();
    expect(booked!.bookings.length).toBeGreaterThanOrEqual(1);
    expect(booked!.approvedCount).toBeGreaterThanOrEqual(1);
    expect(booked!.bookings[0].userId).toBe(USER);
    expect(booked!.bookings[0].userFullName).toBe('Room Tester');
  });

  it('booking olmayan oda boş booking listesi + 0 sayım döner', async () => {
    const rooms = await getRoomsWithOccupancy();
    const active = rooms.find((r) => r.code === ACTIVE_CODE);
    expect(active).toBeDefined();
    expect(active!.bookings).toHaveLength(0);
    expect(active!.approvedCount).toBe(0);
    expect(active!.pendingCount).toBe(0);
  });

  it('pending booking pendingCount\'a yansır', async () => {
    await dbRun(
      `INSERT INTO bookings (id, user_id, room_id, period_months, start_date, end_date,
         project_name, project_description, help_needed, technologies, weekday_mask, status)
       VALUES (?, ?, ?, 1, ?, ?, 'Pending Proje', 'Bekleyen booking — pendingCount testi.', 'yok', '["X"]', 31, 'pending')`,
      [nanoid(), USER, ACTIVE_ROOM, pastDate(1), futureDate(20)]
    );
    const rooms = await getRoomsWithOccupancy();
    const active = rooms.find((r) => r.code === ACTIVE_CODE);
    expect(active!.pendingCount).toBeGreaterThanOrEqual(1);
    expect(active!.approvedCount).toBe(0);
  });
});
