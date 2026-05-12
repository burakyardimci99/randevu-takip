/**
 * Authentication & authorization middleware.
 *
 * Güvenlik:
 * - app_security.md §5: Her endpoint için server-side yetki kontrolü.
 * - User ve Admin token'ları AYRI (farklı RSA key, farklı audience).
 * - Subject type uyuşmuyorsa 401 (auth confusion engellenir).
 */
import type { Request, Response, NextFunction } from 'express';
import { HttpError } from './error.middleware';
import { findSubjectById } from '../services/auth.service';
import { verifyAccessToken } from '../services/token.service';
import { recordAudit } from '../services/audit.service';
import type { SubjectKind } from '../types/auth.types';

function extractBearer(req: Request): string | null {
  const header = req.get('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token.trim();
}

function buildAuthMiddleware(expectedKind: SubjectKind) {
  return function authGuard(req: Request, res: Response, next: NextFunction): void {
    const token = extractBearer(req);
    if (!token) {
      next(new HttpError(401, 'Kimlik doğrulaması gerekli.', 'AUTH_REQUIRED'));
      return;
    }

    try {
      const decoded = verifyAccessToken(expectedKind, token);
      const subject = findSubjectById(expectedKind, decoded.sub);
      if (!subject) {
        next(new HttpError(401, 'Oturum geçersiz.', 'SUBJECT_NOT_FOUND'));
        return;
      }

      req.auth = {
        subjectId: subject.id,
        subjectType: expectedKind,
        email: subject.email,
        role: subject.role,
      };
      next();
    } catch (err) {
      recordAudit({
        eventType: 'authz.denied',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
        success: false,
        details: {
          path: req.path,
          expected: expectedKind,
          reason: (err as Error).message,
        },
      });
      next(new HttpError(401, 'Kimlik doğrulaması başarısız.', 'AUTH_INVALID'));
    }
  };
}

export const requireUser = buildAuthMiddleware('user');
export const requireAdmin = buildAuthMiddleware('admin');

export function requireAdminRole(...allowedRoles: Array<'admin' | 'super_admin'>) {
  return function roleGuard(req: Request, _res: Response, next: NextFunction): void {
    if (!req.auth || req.auth.subjectType !== 'admin') {
      next(new HttpError(403, 'Yetki yok.', 'FORBIDDEN'));
      return;
    }
    if (!allowedRoles.includes(req.auth.role as 'admin' | 'super_admin')) {
      recordAudit({
        eventType: 'authz.denied',
        subjectId: req.auth.subjectId,
        subjectType: 'admin',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
        success: false,
        details: { requiredRoles: allowedRoles, actual: req.auth.role },
      });
      next(new HttpError(403, 'Yetki yok.', 'FORBIDDEN'));
      return;
    }
    next();
  };
}
