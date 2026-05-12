/**
 * Unified authentication routes.
 * Path: /api/auth/*
 *
 * Kullanıcı ve admin'in aynı login formundan giriş yapmasını sağlar.
 * Backend hangi tabloda eşleşme bulduğunu döner; frontend yönlendirme yapar.
 *
 * Güvenlik:
 * - Admin önceliği (aynı e-posta her iki tabloda varsa admin yetkisi verilir)
 * - Timing-safe (kullanıcı yoksa bile decoy argon2 hash)
 * - JWT keypair'ler hala AYRI (cross-token kullanım reddedilir — auth.middleware'de doğrulanıyor)
 * - Refresh token rotation aynı subject_type üzerinde işler
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { loginSchema, refreshSchema, registerSchema } from '../validators/schemas';
import { unifiedLogin, registerUser } from '../services/auth.service';
import {
  revokeRefreshToken,
  rotateRefreshToken,
  verifyAccessToken,
} from '../services/token.service';
import { recordAudit } from '../services/audit.service';
import { authRateLimit } from '../middleware/security.middleware';
import { HttpError } from '../middleware/error.middleware';
import {
  clearRefreshCookie,
  getRefreshCookie,
  setRefreshCookie,
} from '../middleware/cookie-auth';
import { isMfaRequired } from '../services/mfa.service';
import { maskEmail } from '../utils/logger';
import type { SubjectKind } from '../types/auth.types';

const router = Router();

/**
 * Yeni kullanıcı kaydı — sadece 'user' rolü.
 * Admin oluşturmak için bu endpoint kullanılamaz (DB seviyesinde users tablosuna yazılır).
 */
router.post(
  '/register',
  authRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = registerSchema.parse(req.body);
      const created = await registerUser(input);

      // Hesap oluşturulduktan sonra otomatik login (UX için)
      const loginResult = await unifiedLogin(created.email, input.password);

      recordAudit({
        eventType: 'auth.login.success',
        subjectId: created.id,
        subjectType: 'user',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
        success: true,
        details: { email: maskEmail(created.email), registration: true },
      });

      setRefreshCookie(res, 'user', loginResult.tokens.refreshToken);

      res.status(201).json({
        accessToken: loginResult.tokens.accessToken,
        refreshToken: loginResult.tokens.refreshToken, // geriye uyum: cookie-mode sonrası kaldırılacak
        expiresIn: loginResult.tokens.expiresIn,
        type: 'user' as const,
        subject: loginResult.subject,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        recordAudit({
          eventType: 'validation.failure',
          subjectType: 'anonymous',
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
          success: false,
          details: {
            scope: 'registration',
            email: typeof req.body?.email === 'string' ? maskEmail(req.body.email) : null,
            code: err.code,
          },
        });
      }
      next(err);
    }
  }
);

router.post(
  '/login',
  authRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = loginSchema.parse(req.body);
      const result = await unifiedLogin(input.email, input.password);

      recordAudit({
        eventType: 'auth.login.success',
        subjectId: result.subject.id,
        subjectType: result.kind,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
        success: true,
        details: { email: maskEmail(result.subject.email), unified: true },
      });

      setRefreshCookie(res, result.kind, result.tokens.refreshToken);

      const mfaRequired = result.kind === 'admin' && isMfaRequired(result.subject.id);

      res.json({
        accessToken: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken, // geriye uyum
        expiresIn: result.tokens.expiresIn,
        type: result.kind,
        subject: result.subject,
        mfaRequired,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        recordAudit({
          eventType:
            err.code === 'ACCOUNT_LOCKED' ? 'auth.login.locked' : 'auth.login.failure',
          subjectType: 'anonymous',
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
          success: false,
          details: {
            email: typeof req.body?.email === 'string' ? maskEmail(req.body.email) : null,
            code: err.code,
            unified: true,
          },
        });
      }
      next(err);
    }
  }
);

/**
 * Unified refresh: frontend, sahip olduğu subject_type'ı body içinde bildirir.
 * Backend yine doğru key pair ile validate eder.
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const access = req.get('authorization')?.split(' ')[1];
    if (!access) throw new HttpError(401, 'Access token gerekli.', 'AUTH_REQUIRED');

    // Hangi key pair ile decode edileceğini access token'dan bul
    // İlk user olarak dene, başarısızsa admin
    let decoded;
    let kind: SubjectKind = 'user';
    try {
      decoded = verifyAccessToken('user', access);
    } catch {
      try {
        decoded = verifyAccessToken('admin', access);
        kind = 'admin';
      } catch {
        throw new HttpError(401, 'Access token geçersiz.', 'AUTH_INVALID');
      }
    }

    // Cookie öncelikli, body fallback (geriye uyum)
    const cookieToken = getRefreshCookie(req, kind);
    const refreshToken =
      cookieToken ??
      (refreshSchema.safeParse(req.body).success
        ? (refreshSchema.parse(req.body).refreshToken as string)
        : null);
    if (!refreshToken) {
      throw new HttpError(401, 'Refresh token bulunamadı.', 'REFRESH_INVALID');
    }

    const outcome = rotateRefreshToken(kind, refreshToken, {
      sub: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    });

    if (!outcome.ok) {
      const isReuse = outcome.reason === 'reuse_detected';
      // Saldırı veya geçersiz refresh: cookie'yi temizle
      clearRefreshCookie(res, kind);
      recordAudit({
        eventType: isReuse ? 'auth.refresh.reuse_detected' : 'auth.refresh.failure',
        subjectId: decoded.sub,
        subjectType: kind,
        ipAddress: req.ip,
        success: false,
        details: { reason: outcome.reason },
      });
      throw new HttpError(
        401,
        isReuse ? 'Oturum güvenliği gereği yeniden giriş yapın.' : 'Refresh token geçersiz.',
        isReuse ? 'REFRESH_REUSE' : 'REFRESH_INVALID'
      );
    }

    const rotated = outcome.tokens;
    setRefreshCookie(res, kind, rotated.refreshToken);
    recordAudit({
      eventType: 'auth.refresh.success',
      subjectId: rotated.subjectId,
      subjectType: kind,
      ipAddress: req.ip,
      success: true,
    });

    res.json({
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken, // geriye uyum
      expiresIn: rotated.expiresIn,
      type: kind,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokens: string[] = [];
    const userCookie = getRefreshCookie(req, 'user');
    if (userCookie) tokens.push(userCookie);
    const adminCookie = getRefreshCookie(req, 'admin');
    if (adminCookie) tokens.push(adminCookie);

    const bodyParsed = refreshSchema.safeParse(req.body);
    if (bodyParsed.success) tokens.push(bodyParsed.data.refreshToken);

    for (const t of tokens) revokeRefreshToken(t);

    clearRefreshCookie(res, 'user');
    clearRefreshCookie(res, 'admin');

    recordAudit({
      eventType: 'auth.logout',
      ipAddress: req.ip,
      success: true,
      details: { unified: true },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
