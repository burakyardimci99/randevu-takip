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
  /** audit_logs yaş-bazlı retention (gün). 0 = silme. */
  auditRetentionDays: number;
  /** audit_logs hacim sınırı — en yeni N kayıt tutulur (yaştan bağımsız şişme koruması). 0 = sınırsız. */
  auditMaxRows: number;
  /** Silme sonrası VACUUM çalıştır (DELETE tek başına dosyayı küçültmez). */
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
  // Hacim güvenliği: yüksek log üretiminde SQLite'ın şişmesini önler.
  auditMaxRows: envInt('AUDIT_MAX_ROWS', 200_000),
  vacuumOnPrune: process.env.AUDIT_VACUUM !== 'false',
  intervalMs: 6 * 60 * 60 * 1000, // 6 saat
};

let timer: NodeJS.Timeout | null = null;

export function runMaintenanceOnce(config: Partial<MaintenanceConfig> = {}): {
  refreshTokensDeleted: number;
  auditLogsDeleted: number;
  vacuumed: boolean;
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

  // 2) Audit log retention — yaş bazlı
  let auditDeleted = 0;
  if (cfg.auditRetentionDays > 0) {
    const auditCutoff = new Date(
      Date.now() - cfg.auditRetentionDays * ONE_DAY_MS
    ).toISOString();
    auditDeleted += db
      .prepare(`DELETE FROM audit_logs WHERE created_at < ?`)
      .run(auditCutoff).changes;
  }

  // 3) Audit log hacim sınırı — en yeni N kayıt tutulur. Yaş retention'ı aşan
  //    yüksek log üretiminde dosyanın patlamasını engeller.
  if (cfg.auditMaxRows > 0) {
    const total = (db.prepare('SELECT COUNT(*) AS c FROM audit_logs').get() as { c: number }).c;
    if (total > cfg.auditMaxRows) {
      auditDeleted += db
        .prepare(
          `DELETE FROM audit_logs
           WHERE rowid IN (
             SELECT rowid FROM audit_logs ORDER BY created_at ASC, rowid ASC LIMIT ?
           )`
        )
        .run(total - cfg.auditMaxRows).changes;
    }
  }

  // 4) VACUUM — silinen alanı diske geri ver (DELETE tek başına dosyayı küçültmez).
  //    Sadece gerçek silme olduğunda; VACUUM transaction içinde çalışamaz.
  const totalDeleted = tokenRes.changes + auditDeleted;
  let vacuumed = false;
  if (cfg.vacuumOnPrune && totalDeleted > 0) {
    try {
      db.exec('VACUUM');
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
