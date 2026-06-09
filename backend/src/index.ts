/**
 * Kuveyt Türk AI Lab - Randevu Sistemi (AI Lab oda randevu)
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
import { initSchema, dbOne, closeDb } from './db/schema';
import { logger } from './utils/logger';
import {
  corsMiddleware,
  globalRateLimit,
  helmetMiddleware,
  permissionsPolicyMiddleware,
  requestLogger,
} from './middleware/security.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { csrfProtection, csrfTokenHandler } from './middleware/cookie-auth';
import { initSseRoutes, closeAllSse } from './services/sse.service';
import { getQueue } from './services/queue.service';
import { startWaitlistMaintenance } from './services/waitlist.service';
import { warmupEmbeddings, backfillEmbeddings } from './services/embedding.service';
import { warmupTranslation } from './services/image-gen.service';
import { startMaintenance } from './services/maintenance.service';
import { startBackupCron } from './services/backup.service';
import { registerEmailHandler } from './services/notification.service';

import unifiedAuthRoutes from './routes/auth.routes';
import userAuthRoutes from './routes/user-auth.routes';
import adminAuthRoutes from './routes/admin-auth.routes';
import userRoutes from './routes/user.routes';
import adminRoutes from './routes/admin.routes';
import governanceRoutes from './routes/governance.routes';
import chatRoutes from './routes/chat.routes';
import showcaseRoutes from './routes/showcase.routes';
import publicRoutes from './routes/public.routes';
import { openApiDocument } from './openapi';

function buildApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmetMiddleware);
  app.use(permissionsPolicyMiddleware);
  app.use(corsMiddleware);
  app.use(express.json({ limit: '512kb' })); // profil fotoğrafı (200KB JPEG + base64 overhead) için
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(globalRateLimit);

  // Liveness — process ayakta mı (bağımlılık kontrolü yok, her zaman hızlı).
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'klab-randevu', time: new Date().toISOString() });
  });

  // Readiness — DB'ye gerçekten bağlanabiliyor mu? Orchestrator/LB bu yeşil
  // olmadan trafik yönlendirmemeli (DB hazır değilken 500 dönmesin).
  app.get('/api/readiness', async (_req: Request, res: Response) => {
    try {
      await dbOne('SELECT 1 AS ok');
      res.json({ status: 'ready' });
    } catch (err) {
      logger.warn('readiness_check_failed', { err: (err as Error).message });
      res.status(503).json({ status: 'not_ready' });
    }
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
  app.use('/api/governance', governanceRoutes);
  app.use('/api/chat', chatRoutes);                 // Rol-bağımsız genel sohbet
  app.use('/api/showcase', showcaseRoutes);         // Rol-bağımsız envanter okuma (beğeni/yorum görüntüleme)

  app.use(notFoundHandler);
  app.use(errorHandler);

  // CSRF middleware globalde uygulanmıyor — auth endpointleri (login/register/refresh)
  // henüz session olmadığından korumadan muaf. State-changing endpointlerde
  // route-level csrfProtection enforce edilecek (user.routes + admin.routes).
  // Bu, geriye uyum + güvenlik dengesi içindir.
  void csrfProtection;

  return app;
}

async function start(): Promise<void> {
  const migrationResult = await initSchema();
  logger.info('schema_ready', { applied: migrationResult.applied });
  if (migrationResult.applied.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[KLAB] Uygulanan migrationlar: ${migrationResult.applied.join(', ')}`);
  }

  // Embedding modeli arka planda warm-up, ardından eksik booking embedding'lerini
  // backfill et (idempotent — yalnız embedding'i olmayanları işler). Böylece benzer
  // proje / iş birliği / duplicate-tespiti (#4) re-seed sonrası kutudan çıktığı gibi
  // çalışır; manuel admin backfill gerekmez. Non-blocking.
  void warmupEmbeddings()
    .then(() => backfillEmbeddings())
    .then((r) => {
      if (r.processed > 0) {
        logger.info('embedding_backfill_done', { processed: r.processed, skipped: r.skipped });
      }
    })
    .catch((err) =>
      logger.warn('embedding_warmup_or_backfill_failed', { err: (err as Error).message })
    );

  // Görsel prompt çeviri modelini (HF opus-mt-tr-en) arka planda ısıt — ilk
  // görsel üretiminde soğuk-başlangıç çevirisi zaman aşımına düşmesin. Non-blocking.
  void warmupTranslation();

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

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutdown_signal', { signal });

    // Force-exit guard: uzun-ömürlü bağlantılar/asılı job'lar shutdown'ı sonsuza
    // kadar bloklamasın (timeout sonunda non-zero ile çık → orchestrator restart).
    const forceTimer = setTimeout(() => {
      logger.error('shutdown_forced_timeout');
      process.exit(1);
    }, 15_000);
    forceTimer.unref();

    // 1) Açık SSE stream'lerini kapat (yoksa server.close() asılı kalır).
    closeAllSse();

    server.close(() => {
      // 2) Kuyruğu boşalt (e-posta/embedding job'ları kaybolmasın) + DB pool'u kapat.
      void (async () => {
        try {
          await getQueue().shutdown();
        } catch (err) {
          logger.warn('queue_shutdown_failed', { err: (err as Error).message });
        }
        try {
          await closeDb();
        } catch (err) {
          logger.warn('db_close_failed', { err: (err as Error).message });
        }
        clearTimeout(forceTimer);
        logger.info('server_closed');
        process.exit(0);
      })();
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[KLAB] Başlatma hatası:', err);
  process.exit(1);
});
