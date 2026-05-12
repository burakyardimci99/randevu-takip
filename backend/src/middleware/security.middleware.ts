/**
 * Security middleware bundle.
 *
 * Uygulanan koruma katmanları:
 * - helmet:        HSTS, CSP, X-Content-Type-Options, X-Frame-Options (app_security.md §6)
 * - CORS:          Whitelist origin (wildcard yasak — app_security.md §6)
 * - rate-limit:    Brute force ve DoS koruması (app_security.md §6, §10)
 */
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { recordAudit } from '../services/audit.service';
import { logger } from '../utils/logger';

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", config.frontendOrigin],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: config.isProduction ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: config.isProduction
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  frameguard: { action: 'deny' },
  noSniff: true,
});

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || origin === config.frontendOrigin) {
      return callback(null, true);
    }
    logger.warn('cors_rejected', { origin });
    return callback(new Error('CORS politikası: izin verilmeyen origin.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  exposedHeaders: ['X-CSRF-Token'],
  maxAge: 86400,
});

/**
 * Rate limit devre dışı bayrağı.
 * DISABLE_RATE_LIMIT=1 set ise: tüm rate-limit middleware'leri no-op olur.
 * Demo/dev/test için pratik; PRODUCTION'da KESİNLİKLE set edilmemeli (app_security §6).
 */
const RATE_LIMIT_DISABLED = process.env.DISABLE_RATE_LIMIT === '1';

const noopMiddleware = (_req: Request, _res: Response, next: NextFunction): void => next();

export const globalRateLimit = RATE_LIMIT_DISABLED
  ? noopMiddleware
  : rateLimit({
      windowMs: config.rateLimitWindowMs,
      // Dev ortamında 10x daha yüksek limit — Vite proxy + StrictMode + HMR
      // beklemediğimiz şekilde sayaca dahil oluyor. Production'da config değeri kullanılır.
      max: config.isProduction ? config.rateLimitMaxRequests : config.rateLimitMaxRequests * 10,
      standardHeaders: true,
      legacyHeaders: false,
      // Health check muaf — dev araçları sıkça poll eder
      skip: (req) => req.path === '/api/health' || (!config.isProduction && req.method === 'GET'),
      message: { error: 'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.' },
      handler: (req: Request, res: Response) => {
        recordAudit({
          eventType: 'rate_limit.exceeded',
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
          success: false,
          details: { path: req.path, scope: 'global' },
        });
        res.status(429).json({ error: 'Çok fazla istek gönderildi.' });
      },
    });

export const authRateLimit = RATE_LIMIT_DISABLED
  ? noopMiddleware
  : rateLimit({
      windowMs: config.rateLimitWindowMs,
      max: config.authRateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      message: { error: 'Çok fazla deneme. Lütfen biraz bekleyin.' },
      handler: (req: Request, res: Response) => {
        recordAudit({
          eventType: 'rate_limit.exceeded',
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
          success: false,
          details: { path: req.path, scope: 'auth' },
        });
        res.status(429).json({ error: 'Çok fazla deneme. Lütfen biraz bekleyin.' });
      },
    });

export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  logger.info('request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
}
