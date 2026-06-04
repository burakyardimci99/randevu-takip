/**
 * Periyodik bakım işleri (cron).
 *
 * - Refresh token cleanup: süresi geçmiş + uzun zamandır revoked olan token'ları siler.
 * - Audit retention: data_security §11 — eski audit_logs N gün sonra silinebilir (config'den).
 *   (Default 365 gün — bankacılık için tipik.)
 *
 * Çalışma: setInterval — production'da BullMQ/cron'a taşınabilir.
 * Tek instance varsayımı geçerli (in-memory in-process); multi-instance için
 * Redis lock veya pg_advisory_lock gerekir.
 */
import { dbExec, dbOne, dbRun } from '../db/schema';
import { logger } from '../utils/logger';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface MaintenanceConfig {
  /** Süresi geçmiş VE revoked olan refresh token'ları kaç gün sonra sil. */
  refreshTokenGraceDays: number;
  /** audit_logs yaş-bazlı retention (gün). 0 = silme. */
  auditRetentionDays: number;
  /** audit_logs hacim sınırı — en yeni N kayıt tutulur (yaştan bağımsız şişme koruması). 0 = sınırsız. */
  auditMaxRows: number;
  /** Silme sonrası VACUUM çalıştır (ölü tuple alanını geri kazanır). */
  vacuumOnPrune: boolean;
  /** Cron periyodu (ms). */
  intervalMs: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const DEFAULT_CONFIG: MaintenanceConfig = {
  refreshTokenGraceDays: 30,
  // data_security §11 — bankacılık tipik 1 yıl; ortamına göre AUDIT_RETENTION_DAYS ile kısalt.
  auditRetentionDays: envInt('AUDIT_RETENTION_DAYS', 365),
  // Hacim güvenliği: yüksek log üretiminde audit_logs tablosunun şişmesini önler.
  auditMaxRows: envInt('AUDIT_MAX_ROWS', 200_000),
  vacuumOnPrune: process.env.AUDIT_VACUUM !== 'false',
  intervalMs: 6 * 60 * 60 * 1000, // 6 saat
};

let timer: NodeJS.Timeout | null = null;

export async function runMaintenanceOnce(config: Partial<MaintenanceConfig> = {}): Promise<{
  refreshTokensDeleted: number;
  auditLogsDeleted: number;
  vacuumed: boolean;
}> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // 1) Refresh token cleanup
  const tokenCutoff = new Date(Date.now() - cfg.refreshTokenGraceDays * ONE_DAY_MS).toISOString();
  const tokenRes = await dbRun(`DELETE FROM refresh_tokens
       WHERE (expires_at < ? OR revoked = 1)
         AND created_at < ?`, [tokenCutoff, tokenCutoff]);

  // 2) Audit log retention — yaş bazlı
  let auditDeleted = 0;
  if (cfg.auditRetentionDays > 0) {
    const auditCutoff = new Date(
      Date.now() - cfg.auditRetentionDays * ONE_DAY_MS
    ).toISOString();
    auditDeleted += (await dbRun(`DELETE FROM audit_logs WHERE created_at < ?`, [auditCutoff])).changes;
  }

  // 3) Audit log hacim sınırı — en yeni N kayıt tutulur. Yaş retention'ı aşan
  //    yüksek log üretiminde dosyanın patlamasını engeller.
  if (cfg.auditMaxRows > 0) {
    const total = (await dbOne('SELECT COUNT(*) AS c FROM audit_logs', []) as { c: number }).c;
    if (total > cfg.auditMaxRows) {
      auditDeleted += (await dbRun(`DELETE FROM audit_logs
           WHERE id IN (
             SELECT id FROM audit_logs ORDER BY created_at ASC, id ASC LIMIT ?
           )`, [total - cfg.auditMaxRows])).changes;
    }
  }

  // 4) VACUUM — silme sonrası ölü tuple'ların alanını geri kazan (PostgreSQL).
  //    Sadece gerçek silme olduğunda; VACUUM transaction içinde çalışamaz.
  const totalDeleted = tokenRes.changes + auditDeleted;
  let vacuumed = false;
  if (cfg.vacuumOnPrune && totalDeleted > 0) {
    try {
      await dbExec('VACUUM'); // pg'de de geçerli; best-effort (try/catch)
      vacuumed = true;
    } catch (err) {
      logger.warn('maintenance_vacuum_failed', { err: (err as Error).message });
    }
  }

  const result = {
    refreshTokensDeleted: tokenRes.changes,
    auditLogsDeleted: auditDeleted,
    vacuumed,
  };

  if (totalDeleted > 0) {
    logger.info('maintenance_completed', result);
  }
  return result;
}

export function startMaintenance(config: Partial<MaintenanceConfig> = {}): void {
  if (timer) return;
  const cfg = { ...DEFAULT_CONFIG, ...config };
  // İlk çalışma — server start sonrası 10sn bekle
  setTimeout(() => {
    try {
      runMaintenanceOnce(cfg);
    } catch (err) {
      logger.warn('maintenance_initial_run_failed', { err: (err as Error).message });
    }
  }, 10_000);
  timer = setInterval(() => {
    try {
      runMaintenanceOnce(cfg);
    } catch (err) {
      logger.warn('maintenance_run_failed', { err: (err as Error).message });
    }
  }, cfg.intervalMs);
}

export function stopMaintenance(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
