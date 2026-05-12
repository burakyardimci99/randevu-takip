/**
 * KVKK uyum testleri — data export + right to be forgotten.
 */
import './setup-env';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { initSchema, closeDb, getDb } from '../src/db/schema';
import {
  exportUserData,
  purgeUser,
} from '../src/services/privacy.service';
import { HttpError } from '../src/middleware/error.middleware';

const USER_ID = nanoid();
const ROOM_ID = nanoid();
const BOOKING_PENDING = nanoid();
const BOOKING_APPROVED = nanoid();

const futureDate = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

beforeAll(async () => {
  initSchema();
  const db = getDb();
  const hash = await argon2.hash('TestPass123!', { type: argon2.argon2id });
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, password_hash, full_name, department)
     VALUES (?, ?, ?, ?, ?)`
  ).run(USER_ID, 'kvkk@test.local', hash, 'Veri Sahibi', 'Compliance');
  db.prepare(
    `INSERT OR IGNORE INTO rooms (id, code, name, district, neighborhood, capacity)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(ROOM_ID, 'KV-01', 'KVKK Test Oda', 'Test', 'Mahalle', 4);

  // 2 booking: 1 pending, 1 approved
  db.prepare(
    `INSERT INTO bookings (id, user_id, room_id, period_months, start_date, end_date,
       project_name, project_description, help_needed, technologies, status)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, 'yok', ?, 'pending')`
  ).run(
    BOOKING_PENDING,
    USER_ID,
    ROOM_ID,
    futureDate(200),
    futureDate(230),
    'Pending proje',
    'Bu pending bir proje, silindiğinde tamamen yok olmalı.',
    JSON.stringify(['Claude'])
  );

  db.prepare(
    `INSERT INTO bookings (id, user_id, room_id, period_months, start_date, end_date,
       project_name, project_description, help_needed, technologies, status)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, 'yok', ?, 'approved')`
  ).run(
    BOOKING_APPROVED,
    USER_ID,
    ROOM_ID,
    futureDate(300),
    futureDate(330),
    'Approved proje',
    'Bu approved bir proje, pseudonymize edilmeli — tarih bütünlüğü için kalır.',
    JSON.stringify(['GPT'])
  );
});

afterAll(() => {
  closeDb();
});

describe('exportUserData', () => {
  it('user verisini + bookings + audit dahil eder', () => {
    const data = exportUserData(USER_ID);
    expect(data.user.id).toBe(USER_ID);
    expect(data.user.email).toBe('kvkk@test.local');
    expect(data.bookings.length).toBeGreaterThanOrEqual(2);
    expect(data.generatedAt).toBeDefined();
    expect(data.schemaVersion).toBe('1.0');
  });

  it('var olmayan user için 404 atar', () => {
    expect(() => exportUserData('does-not-exist')).toThrow(HttpError);
  });
});

describe('purgeUser — Right to be Forgotten', () => {
  it('user silindiğinde PII pseudonymize edilir', () => {
    const result = purgeUser(USER_ID, { id: USER_ID, type: 'user' });
    expect(result.purgedUser.id).toBe(USER_ID);
    expect(result.purgedUser.pseudonymizedAs).toMatch(/^deleted-/);

    const db = getDb();
    const user = db
      .prepare('SELECT email, full_name, status, password_hash FROM users WHERE id = ?')
      .get(USER_ID) as {
        email: string;
        full_name: string;
        status: number;
        password_hash: string;
      };
    // Hassas alanlar temizlendi
    expect(user.email).toContain('@purged.local');
    expect(user.full_name).toBe('[Silinen kullanıcı]');
    expect(user.password_hash).toBe(''); // login imkânsız
    expect(user.status).toBe(3); // soft-delete
  });

  it('pending booking silinir', () => {
    const db = getDb();
    const pending = db.prepare('SELECT id FROM bookings WHERE id = ?').get(BOOKING_PENDING);
    expect(pending).toBeUndefined(); // silindi
  });

  it('approved booking korunur ama description pseudonymize edilir', () => {
    const db = getDb();
    const approved = db
      .prepare('SELECT project_description, status FROM bookings WHERE id = ?')
      .get(BOOKING_APPROVED) as { project_description: string; status: string };
    expect(approved.status).toBe('approved'); // hala kayıtlı
    expect(approved.project_description).toContain('silindi');
  });

  it('refresh tokenlar revoke edilir', () => {
    const db = getDb();
    // İlk önce bir token ekle
    const tokenId = nanoid();
    db.prepare(
      `INSERT INTO refresh_tokens (id, token_hash, subject_id, subject_type, expires_at)
       VALUES (?, ?, ?, 'user', ?)`
    ).run(tokenId, 'hash-' + tokenId, USER_ID, futureDate(7));

    // Ayrı bir user yarat ki tokenlar yine purge ile silinsin
    const otherUser = nanoid();
    db.prepare(`INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`).run(
      otherUser,
      'other-' + otherUser + '@test.local',
      'x',
      'Other'
    );
    const otherToken = nanoid();
    db.prepare(
      `INSERT INTO refresh_tokens (id, token_hash, subject_id, subject_type, expires_at)
       VALUES (?, ?, ?, 'user', ?)`
    ).run(otherToken, 'hash-' + otherToken, otherUser, futureDate(7));

    purgeUser(otherUser, { id: otherUser, type: 'user' });

    const tokenAfter = db
      .prepare('SELECT revoked FROM refresh_tokens WHERE id = ?')
      .get(otherToken) as { revoked: number };
    expect(tokenAfter.revoked).toBe(1);
  });

  it('audit log: user.delete event yazıldı', () => {
    const db = getDb();
    const logs = db
      .prepare(
        `SELECT event_type, details FROM audit_logs
         WHERE event_type = 'user.delete'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get() as { event_type: string; details: string };
    expect(logs.event_type).toBe('user.delete');
    const details = JSON.parse(logs.details);
    expect(details.action).toBe('data_purge');
  });
});
