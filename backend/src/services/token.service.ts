/**
 * JWT token üretimi ve doğrulaması.
 *
 * Güvenlik:
 * - app_security.md §4: Sadece RS256 (HS256/none yasak).
 * - Access token TTL: 15dk; Refresh token rotation + reuse detection.
 * - app_security.md §4: Payload'da parola/CVV/TCKN/PAN yok.
 * - SHA-256 ile refresh token hash'lenip DB'de saklanır (raw token DB'de yok).
 * - Reuse detection: Eski refresh token tekrar kullanılırsa o subject'in
 *   tüm refresh chain'i revoke edilir (OWASP "rotation + reuse" pattern).
 */
import jwt, { type SignOptions, type VerifyOptions } from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { nanoid } from 'nanoid';
import { config } from '../config/env';
import { getDb } from '../db/schema';
import type { JwtPayload, SubjectKind } from '../types/auth.types';
import { logger } from '../utils/logger';

interface KeyBundle {
  privateKey: string;
  publicKey: string;
  audience: string;
  accessTtl: number;
  refreshTtl: number;
}

function getKeyBundle(kind: SubjectKind): KeyBundle {
  if (kind === 'user') {
    return {
      privateKey: config.userJwtPrivateKey,
      publicKey: config.userJwtPublicKey,
      audience: config.userJwtAudience,
      accessTtl: config.userAccessTokenTtl,
      refreshTtl: config.userRefreshTokenTtl,
    };
  }
  return {
    privateKey: config.adminJwtPrivateKey,
    publicKey: config.adminJwtPublicKey,
    audience: config.adminJwtAudience,
    accessTtl: config.adminAccessTokenTtl,
    refreshTtl: config.adminRefreshTokenTtl,
  };
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function signAccessToken(
  kind: SubjectKind,
  payload: Omit<JwtPayload, 'type'>
): { token: string; ttl: number } {
  const bundle = getKeyBundle(kind);
  const options: SignOptions = {
    algorithm: 'RS256',
    expiresIn: bundle.accessTtl,
    issuer: config.jwtIssuer,
    audience: bundle.audience,
  };
  const fullPayload: JwtPayload = { ...payload, type: kind };
  const token = jwt.sign(fullPayload, bundle.privateKey, options);
  return { token, ttl: bundle.accessTtl };
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function issueRefreshToken(
  kind: SubjectKind,
  subjectId: string,
  parentId: string | null = null
): { token: string; id: string; expiresAt: Date } {
  const bundle = getKeyBundle(kind);
  const raw = randomBytes(48).toString('base64url');
  const tokenHash = hashToken(raw);
  const id = nanoid();
  const expiresAt = new Date(Date.now() + bundle.refreshTtl * 1000);

  getDb()
    .prepare(
      `INSERT INTO refresh_tokens (id, token_hash, subject_id, subject_type, expires_at, parent_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(id, tokenHash, subjectId, kind, expiresAt.toISOString(), parentId);

  return { token: raw, id, expiresAt };
}

export interface RotatedTokens extends IssuedTokens {
  subjectId: string;
}

export type RotateOutcome =
  | { ok: true; tokens: RotatedTokens }
  | { ok: false; reason: 'not_found' | 'expired' | 'subject_mismatch' | 'kind_mismatch' | 'reuse_detected' };

/**
 * Refresh token rotation + reuse detection.
 *
 * Akış:
 *  1) Token DB'de bulunur (hash ile).
 *  2) revoked=1 ise → REUSE saldırısı şüphesi: o subject'in TÜM refresh token'ları revoke.
 *     (token zaten daha önce kullanılıp rotate edildiyse `used_at` set, sonraki kullanım theft.)
 *  3) Aksi halde yeni token üret, eski token revoke + used_at set, parent_id ile chain.
 */
export function rotateRefreshToken(
  kind: SubjectKind,
  rawToken: string,
  payload: Omit<JwtPayload, 'type'>
): RotateOutcome {
  const tokenHash = hashToken(rawToken);
  const db = getDb();

  const row = db
    .prepare(
      `SELECT id, subject_id, subject_type, expires_at, revoked, used_at
       FROM refresh_tokens WHERE token_hash = ?`
    )
    .get(tokenHash) as
    | {
        id: string;
        subject_id: string;
        subject_type: string;
        expires_at: string;
        revoked: number;
        used_at: string | null;
      }
    | undefined;

  if (!row) return { ok: false, reason: 'not_found' };
  if (row.subject_type !== kind) return { ok: false, reason: 'kind_mismatch' };
  if (row.subject_id !== payload.sub) return { ok: false, reason: 'subject_mismatch' };

  // REUSE saldırısı: zaten kullanılmış (rotated) bir token tekrar geliyor.
  if (row.revoked === 1 || row.used_at !== null) {
    logger.warn('refresh_token_reuse_detected', {
      subject_type: kind,
      subject_id: row.subject_id,
      token_id: row.id,
    });
    // Tüm chain'i iptal et — token theft varsayımı.
    db.prepare(
      'UPDATE refresh_tokens SET revoked = 1 WHERE subject_id = ? AND subject_type = ?'
    ).run(row.subject_id, kind);
    return { ok: false, reason: 'reuse_detected' };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired' };
  }

  // Normal rotation: eski revoke + used_at, yeni token (parent_id ile chain'lenir).
  const txn = db.transaction(() => {
    db.prepare(
      `UPDATE refresh_tokens SET revoked = 1, used_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(row.id);
    return issueRefreshToken(kind, payload.sub, row.id);
  });

  const { token: newRefresh } = txn();
  const { token: accessToken, ttl } = signAccessToken(kind, payload);

  return {
    ok: true,
    tokens: {
      accessToken,
      refreshToken: newRefresh,
      expiresIn: ttl,
      subjectId: payload.sub,
    },
  };
}

export function revokeRefreshToken(rawToken: string): void {
  const tokenHash = hashToken(rawToken);
  getDb().prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?').run(tokenHash);
}

export function revokeAllForSubject(kind: SubjectKind, subjectId: string): void {
  getDb()
    .prepare(
      'UPDATE refresh_tokens SET revoked = 1 WHERE subject_id = ? AND subject_type = ?'
    )
    .run(subjectId, kind);
}

export function verifyAccessToken(kind: SubjectKind, token: string): JwtPayload {
  const bundle = getKeyBundle(kind);
  const options: VerifyOptions = {
    algorithms: ['RS256'],
    issuer: config.jwtIssuer,
    audience: bundle.audience,
  };
  const decoded = jwt.verify(token, bundle.publicKey, options) as JwtPayload;

  if (decoded.type !== kind) {
    throw new Error('Token tipi uyuşmuyor.');
  }
  return decoded;
}
