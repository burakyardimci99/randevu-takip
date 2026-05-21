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
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validators/schemas';
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
  csrfProtection,
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
  csrfProtection,
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
  csrfProtection,
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
 * Parola sıfırlama talebi.
 * Güvenlik: kullanıcı varlığı ifşa edilmez — e-posta kayıtlı olsun olmasın
 * her zaman aynı (başarılı) yanıt döner.
 */
router.post(
  '/forgot-password',
  authRateLimit,
  csrfProtection,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);
      const { requestPasswordReset } = await import('../services/password-reset.service');
      await requestPasswordReset(email);
      recordAudit({
        eventType: 'password_reset.requested',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
        success: true,
        details: { email: maskEmail(email) },
      });
      res.json({
        message:
          'E-posta kayıtlıysa parola sıfırlama bağlantısı gönderildi. Gelen kutunu kontrol et.',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Parola sıfırlama — token + yeni parola.
 */
router.post(
  '/reset-password',
  authRateLimit,
  csrfProtection,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = resetPasswordSchema.parse(req.body);
      const { resetPassword } = await import('../services/password-reset.service');
      const { userId } = await resetPassword(input.token, input.password);
      recordAudit({
        eventType: 'password_reset.completed',
        subjectId: userId,
        subjectType: 'user',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? null,
        success: true,
      });
      res.json({ message: 'Parolan güncellendi. Yeni parolanla giriş yapabilirsin.' });
    } catch (err) {
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

    // Hangi key/aud ile decode edileceğini sırayla dene: user → admin → danisman → arge
    let decoded;
    let kind: SubjectKind = 'user';
    const tryKinds: SubjectKind[] = ['user', 'admin', 'danisman', 'arge'];
    let verified = false;
    for (const k of tryKinds) {
      try {
        decoded = verifyAccessToken(k, access);
        kind = k;
        verified = true;
        break;
      } catch {
        /* try next */
      }
    }
    if (!verified || !decoded) {
      throw new HttpError(401, 'Access token geçersiz.', 'AUTH_INVALID');
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

router.post('/logout', csrfProtection, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokens: string[] = [];
    const kinds: SubjectKind[] = ['user', 'admin', 'danisman', 'arge'];
    for (const k of kinds) {
      const cookie = getRefreshCookie(req, k);
      if (cookie) tokens.push(cookie);
    }

    const bodyParsed = refreshSchema.safeParse(req.body);
    if (bodyParsed.success) tokens.push(bodyParsed.data.refreshToken);

    for (const t of tokens) revokeRefreshToken(t);

    for (const k of kinds) clearRefreshCookie(res, k);

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
