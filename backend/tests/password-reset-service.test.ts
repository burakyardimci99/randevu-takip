/**
 * Şifre sıfırlama servisi — token üretimi + reset akışı testleri.
 *
 * Kapsam:
 *  - requestPasswordReset: kayıtlı e-posta için hash'li token saklanır (ham token DB'de yok).
 *  - resetPassword: geçerli token ile parola güncellenir + token tüketilir.
 *  - süresi geçmiş token reddi.
 *  - kullanılmış token reddi.
 *  - var olmayan e-posta sızdırmaz (enumeration koruması — sessizce başarılı, token üretmez).
 *
 * Ham token, kuyruğa düşen NOTIFY_EMAIL mesajındaki resetUrl'den yakalanır.
 */
import './setup-env';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { createHash } from 'node:crypto';
import { initSchema, closeDb, dbRun, dbOne } from '../src/db/schema';
import {
  requestPasswordReset,
  resetPassword,
} from '../src/services/password-reset.service';
import { getQueue, JobNames } from '../src/services/queue.service';
import { HttpError } from '../src/middleware/error.middleware';

const USER = nanoid();
const EMAIL = `pwreset-${nanoid(6).toLowerCase()}@test.local`;
const ORIGINAL_PASSWORD = 'Demo1234!Pass';

// NOTIFY_EMAIL kuyruğuna düşen mesajdan ham reset token'ını yakala.
const capturedTokens: string[] = [];
function extractToken(url: string): string | null {
  const m = /token=([a-f0-9]+)/i.exec(url);
  return m ? m[1] : null;
}

const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

beforeAll(async () => {
  await initSchema();
  const hash = await argon2.hash(ORIGINAL_PASSWORD, { type: argon2.argon2id });
  await dbRun(`INSERT OR IGNORE INTO users (id, email, password_hash, full_name, status) VALUES (?, ?, ?, ?, 1)`, [
    USER, EMAIL, hash, 'PW Reset Tester',
  ]);

  // E-posta kuyruğunu dinle: resetUrl içindeki ham token'ı yakala.
  getQueue().register<{ text?: string; html?: string }>(JobNames.NOTIFY_EMAIL, (msg) => {
    const text = `${msg.text ?? ''} ${msg.html ?? ''}`;
    const t = extractToken(text);
    if (t) capturedTokens.push(t);
  });
});

afterAll(async () => {
  await closeDb();
});

async function requestAndCaptureToken(email: string): Promise<string> {
  capturedTokens.length = 0;
  await requestPasswordReset(email);
  await getQueue().drain();
  expect(capturedTokens.length).toBe(1);
  return capturedTokens[0];
}

describe('requestPasswordReset', () => {
  it('kayıtlı e-posta için DB\'de hash\'li token saklar (ham token saklanmaz)', async () => {
    const token = await requestAndCaptureToken(EMAIL);
    expect(token).toMatch(/^[a-f0-9]{64}$/); // 32 byte hex

    // Ham token DB'de YOK; yalnız hash'i var.
    const byHash = await dbOne(
      'SELECT id, user_id, used_at FROM password_reset_tokens WHERE token_hash = ?',
      [hashToken(token)]
    ) as { id: string; user_id: string; used_at: string | null } | undefined;
    expect(byHash).toBeDefined();
    expect(byHash!.user_id).toBe(USER);
    expect(byHash!.used_at).toBeNull();

    const byRaw = await dbOne('SELECT id FROM password_reset_tokens WHERE token_hash = ?', [token]);
    expect(byRaw).toBeUndefined();
  });

  it('var olmayan e-posta token üretmez (enumeration koruması — sessizce başarılı)', async () => {
    capturedTokens.length = 0;
    const before = (await dbOne('SELECT COUNT(*) AS c FROM password_reset_tokens', []) as { c: number }).c;

    await expect(requestPasswordReset(`yok-${nanoid(8)}@test.local`)).resolves.toBeUndefined();
    await getQueue().drain();

    const after = (await dbOne('SELECT COUNT(*) AS c FROM password_reset_tokens', []) as { c: number }).c;
    expect(capturedTokens.length).toBe(0);
    expect(after).toBe(before); // yeni token satırı eklenmedi
  });

  it('yeni talep önceki kullanılmamış token\'ları geçersiz kılar', async () => {
    const first = await requestAndCaptureToken(EMAIL);
    const second = await requestAndCaptureToken(EMAIL);
    expect(first).not.toBe(second);

    // İlk token artık used_at set (geçersiz).
    const firstRow = await dbOne(
      'SELECT used_at FROM password_reset_tokens WHERE token_hash = ?',
      [hashToken(first)]
    ) as { used_at: string | null };
    expect(firstRow.used_at).not.toBeNull();
  });
});

describe('resetPassword', () => {
  it('geçerli token ile parolayı değiştirir + token tüketir', async () => {
    const token = await requestAndCaptureToken(EMAIL);
    const newPassword = 'Yeni4567!Sifre';

    const result = await resetPassword(token, newPassword);
    expect(result.userId).toBe(USER);

    // Token tüketildi (used_at set).
    const tokenRow = await dbOne(
      'SELECT used_at FROM password_reset_tokens WHERE token_hash = ?',
      [hashToken(token)]
    ) as { used_at: string | null };
    expect(tokenRow.used_at).not.toBeNull();

    // Parola gerçekten değişti — yeni hash yeni parolayı doğrular.
    const userRow = await dbOne('SELECT password_hash FROM users WHERE id = ?', [USER]) as { password_hash: string };
    expect(await argon2.verify(userRow.password_hash, newPassword)).toBe(true);
    expect(await argon2.verify(userRow.password_hash, ORIGINAL_PASSWORD)).toBe(false);
  });

  it('kullanılmış token ikinci kez reddedilir', async () => {
    const token = await requestAndCaptureToken(EMAIL);
    await resetPassword(token, 'Ikinci8901!Sifre');
    await expect(resetPassword(token, 'Ucuncu2345!Sifre')).rejects.toThrow(HttpError);
  });

  it('süresi geçmiş token reddedilir', async () => {
    const raw = randomHex();
    const id = nanoid();
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 saat önce dolmuş
    await dbRun(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
      [id, USER, hashToken(raw), past]
    );
    await expect(resetPassword(raw, 'Suresi6789!Gecmis')).rejects.toThrow(/geçersiz|süresi|RESET_TOKEN_INVALID/i);
  });

  it('var olmayan token reddedilir', async () => {
    await expect(resetPassword(randomHex(), 'Olmayan1234!Tk')).rejects.toThrow(HttpError);
  });
});

function randomHex(): string {
  return createHash('sha256').update(nanoid() + Date.now()).digest('hex');
}
