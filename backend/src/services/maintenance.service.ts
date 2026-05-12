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
import { getDb } from '../db/schema';
import { logger } from '../utils/logger';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface MaintenanceConfig {
  /** Süresi geçmiş VE revoked olan refresh token'ları kaç gün sonra sil. */
  refreshTokenGraceDays: number;
  /** audit_logs retention (gün). 0 = silme. */
  auditRetentionDays: number;
  /** Cron periyodu (ms). */
  intervalMs: number;
}

const DEFAULT_CONFIG: MaintenanceConfig = {
  refreshTokenGraceDays: 30,
  auditRetentionDays: 365, // data_security §11 — bankacılık tipik 1 yıl
  intervalMs: 6 * 60 * 60 * 1000, // 6 saat
};

let timer: NodeJS.Timeout | null = null;

export function runMaintenanceOnce(config: Partial<MaintenanceConfig> = {}): {
  refreshTokensDeleted: number;
  auditLogsDeleted: number;
} {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const db = getDb();

  // 1) Refresh token cleanup
  const tokenCutoff = new Date(Date.now() - cfg.refreshTokenGraceDays * ONE_DAY_MS).toISOString();
  const tokenRes = db
    .prepare(
      `DELETE FROM refresh_tokens
       WHERE (expires_at < ? OR revoked = 1)
         AND created_at < ?`
    )
    .run(tokenCutoff, tokenCutoff);

  // 2) Audit log retention
  let auditDeleted = 0;
  if (cfg.auditRetentionDays > 0) {
    const auditCutoff = new Date(
      Date.now() - cfg.auditRetentionDays * ONE_DAY_MS
    ).toISOString();
    const auditRes = db
      .prepare(`DELETE FROM audit_logs WHERE created_at < ?`)
      .run(auditCutoff);
    auditDeleted = auditRes.changes;
  }

  const result = {
    refreshTokensDeleted: tokenRes.changes,
    auditLogsDeleted: auditDeleted,
  };

  if (tokenRes.changes > 0 || auditDeleted > 0) {
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
