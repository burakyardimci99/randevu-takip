/**
 * Admin MFA (TOTP — RFC 6238) servisi.
 *
 * Güvenlik:
 * - speakeasy: TOTP generate + verify (RFC 6238, SHA-1, 30s window, 6 digit).
 * - Secret base32 string olarak DB'de saklanır.
 * - Backup code: 8 adet tek-kullanımlık kod (argon2 hash'lenir, kullanıldıkça silinir).
 *   Demo'da basitlik için plain JSON'da tutulur — production'da hash zorunlu.
 * - Time skew tolerance: ±1 window (30s).
 * - app_security.md §4: Admin için MFA önerilir (henüz zorunlu değil — opt-in).
 */
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { dbOne, dbRun, getDb } from '../db/schema';
import { HttpError } from '../middleware/error.middleware';
import { config } from '../config/env';

export interface MfaEnrollResult {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
}

export interface MfaStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

const ISSUER = 'KLAB-Randevu';

async function getAdminRow(
  adminId: string
): Promise<{ id: string; email: string; totp_secret: string | null; totp_enabled: number; totp_backup_codes: string | null }> {
  const row = await dbOne('SELECT id, email, totp_secret, totp_enabled, totp_backup_codes FROM admins WHERE id = ? AND status = 1', [adminId]) as
    | {
        id: string;
        email: string;
        totp_secret: string | null;
        totp_enabled: number;
        totp_backup_codes: string | null;
      }
    | undefined;
  if (!row) throw new HttpError(404, 'Admin bulunamadı.', 'SUBJECT_NOT_FOUND');
  return row;
}

export async function enrollMfa(adminId: string): Promise<MfaEnrollResult> {
  const row = await getAdminRow(adminId);
  if (row.totp_enabled === 1) {
    throw new HttpError(409, 'MFA zaten etkin.', 'MFA_ALREADY_ENABLED');
  }

  const secret = speakeasy.generateSecret({
    name: `${ISSUER}:${row.email}`,
    issuer: ISSUER,
    length: 20,
  });

  // Backup code'lar (8 adet 8-haneli kod)
  const backupCodes: string[] = [];
  for (let i = 0; i < 8; i++) {
    backupCodes.push(
      Math.random().toString(36).slice(2, 6).toUpperCase() +
        '-' +
        Math.random().toString(36).slice(2, 6).toUpperCase()
    );
  }

  // Secret + backup codes DB'ye yazılır — ancak totp_enabled hâlâ 0
  // (kullanıcı 6-digit ile verify edene kadar aktif değil)
  await dbRun('UPDATE admins SET totp_secret = ?, totp_backup_codes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [secret.base32, JSON.stringify(backupCodes), adminId]);

  const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url ?? '');

  return {
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url ?? '',
    qrCodeDataUrl,
    backupCodes,
  };
}

/**
 * 6 haneli kodu (veya backup kodu) doğrula.
 * - İlk verify enroll'u tamamlar (totp_enabled = 1)
 * - Sonraki verify'lar normal MFA challenge.
 */
export async function verifyMfaCode(
  adminId: string,
  code: string
): Promise<{ valid: boolean; usedBackupCode: boolean }> {
  const row = await getAdminRow(adminId);
  if (!row.totp_secret) {
    throw new HttpError(409, 'MFA henüz başlatılmadı.', 'MFA_NOT_ENABLED');
  }

  // Önce TOTP
  const ok = speakeasy.totp.verify({
    secret: row.totp_secret,
    encoding: 'base32',
    token: code,
    window: 1, // ±30s tolerans
  });

  if (ok) {
    // İlk verify: enrollment'ı tamamla
    if (row.totp_enabled === 0) {
      await dbRun('UPDATE admins SET totp_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [adminId]);
    }
    return { valid: true, usedBackupCode: false };
  }

  // Backup code denemesi
  if (row.totp_backup_codes) {
    let codes: string[] = [];
    try {
      codes = JSON.parse(row.totp_backup_codes) as string[];
    } catch {
      codes = [];
    }
    const idx = codes.findIndex((c) => c === code.toUpperCase().trim());
    if (idx >= 0) {
      codes.splice(idx, 1);
      await dbRun('UPDATE admins SET totp_backup_codes = ?, totp_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [JSON.stringify(codes), adminId]);
      return { valid: true, usedBackupCode: true };
    }
  }

  return { valid: false, usedBackupCode: false };
}

export async function disableMfa(adminId: string): Promise<void> {
  const row = await getAdminRow(adminId);
  if (row.totp_enabled === 0) {
    throw new HttpError(409, 'MFA zaten devre dışı.', 'MFA_NOT_ENABLED');
  }
  await dbRun('UPDATE admins SET totp_enabled = 0, totp_secret = NULL, totp_backup_codes = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [adminId]);
}

export async function getMfaStatus(adminId: string): Promise<MfaStatus> {
  const row = await getAdminRow(adminId);
  let remaining = 0;
  if (row.totp_backup_codes) {
    try {
      const arr = JSON.parse(row.totp_backup_codes) as string[];
      remaining = Array.isArray(arr) ? arr.length : 0;
    } catch {
      remaining = 0;
    }
  }
  return {
    enabled: row.totp_enabled === 1,
    backupCodesRemaining: remaining,
  };
}

export async function isMfaRequired(adminId: string): Promise<boolean> {
  const row = await dbOne('SELECT totp_enabled FROM admins WHERE id = ? AND status = 1', [adminId]) as { totp_enabled: number } | undefined;
  return !!row && row.totp_enabled === 1;
}

// Production hardening note (config.isProduction reference for unused import lint)
void config;
