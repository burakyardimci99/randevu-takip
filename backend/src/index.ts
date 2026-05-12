/**
 * Kuveyt Türk AI Lab - Randevu/Oda Kiralama Sistemi
 * Backend entrypoint.
 *
 * Güvenlik: helmet, CORS whitelist, rate limit, audit log, RS256 JWT (User+Admin ayrı).
 */
// OpenTelemetry — auto-instrumentation için EN BAŞTA initialize edilir
import { initOtel } from './observability/otel';
void initOtel();

import express, { type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import { initSchema } from './db/schema';
import { logger } from './utils/logger';
import {
  corsMiddleware,
  globalRateLimit,
  helmetMiddleware,
  requestLogger,
} from './middleware/security.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { csrfProtection, csrfTokenHandler } from './middleware/cookie-auth';
import { initSseRoutes } from './services/sse.service';
import { startWaitlistMaintenance } from './services/waitlist.service';
import { warmupEmbeddings } from './services/embedding.service';
import { startMaintenance } from './services/maintenance.service';
import { startBackupCron } from './services/backup.service';
import { registerEmailHandler } from './services/notification.service';

import unifiedAuthRoutes from './routes/auth.routes';
import userAuthRoutes from './routes/user-auth.routes';
import adminAuthRoutes from './routes/admin-auth.routes';
import userRoutes from './routes/user.routes';
import adminRoutes from './routes/admin.routes';
import publicRoutes from './routes/public.routes';
import { openApiDocument } from './openapi';

function buildApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmetMiddleware);
  app.use(corsMiddleware);
  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(globalRateLimit);

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'klab-randevu', time: new Date().toISOString() });
  });

  // CSRF token endpoint (GET — CSRF korumalı değil, token üretir)
  app.get('/api/csrf', csrfTokenHandler);

  // OpenAPI 3.1 schema (public, no auth)
  app.get('/api/openapi.json', (_req: Request, res: Response) => {
    res.json(openApiDocument);
  });

  // SSE: real-time notification stream (auth bearer query veya cookie ile)
  initSseRoutes(app);

  // Public (auth gerektirmeyen) showcase + odalar
  app.use('/api/public', publicRoutes);

  app.use('/api/auth', unifiedAuthRoutes);          // Birleşik giriş
  app.use('/api/user/auth', userAuthRoutes);        // Eski yol (geriye uyum)
  app.use('/api/admin/auth', adminAuthRoutes);      // Eski yol (geriye uyum)
  app.use('/api/user', userRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  // CSRF middleware globalde uygulanmıyor — auth endpointleri (login/register/refresh)
  // henüz session olmadığından korumadan muaf. State-changing endpointlerde
  // route-level csrfProtection enforce edilecek (user.routes + admin.routes).
  // Bu, geriye uyum + güvenlik dengesi içindir.
  void csrfProtection;

  return app;
}

function start(): void {
  const migrationResult = initSchema();
  logger.info('schema_ready', { applied: migrationResult.applied });
  if (migrationResult.applied.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[KLAB] Uygulanan migrationlar: ${migrationResult.applied.join(', ')}`);
  }

  // Embedding modeli arka planda warm-up — semantic search ilk istek hızı için
  warmupEmbeddings().catch((err) =>
    logger.warn('embedding_warmup_failed', { err: (err as Error).message })
  );

  // E-posta job handler (queue üzerinden async send)
  registerEmailHandler();

  // Waitlist promotion cron (yarım dakika periyot)
  startWaitlistMaintenance();

  // Refresh token cleanup + audit retention cron (6 saat)
  startMaintenance();

  // DB backup cron (default 24h)
  startBackupCron();

  const app = buildApp();
  const server = app.listen(config.port, config.host, () => {
    logger.info('server_started', {
      host: config.host,
      port: config.port,
      env: config.nodeEnv,
    });
    // eslint-disable-next-line no-console
    console.log(`\n[KLAB] Backend hazır → http://${config.host}:${config.port}\n`);
  });

  const shutdown = (signal: string) => {
    logger.info('shutdown_signal', { signal });
    server.close(() => {
      logger.info('server_closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();
