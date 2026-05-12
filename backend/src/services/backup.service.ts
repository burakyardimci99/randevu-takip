/**
 * DB backup servisi.
 *
 * SQLite için better-sqlite3 `db.backup()` API'sini kullanır — atomic snapshot.
 * PostgreSQL adapter eklendiğinde `pg_dump` veya `pg_basebackup` ile değiştirilir.
 *
 * Strateji:
 *  - Default: 24 saatte bir backup, klasör: backend/data/backups/
 *  - Retention: en yeni N dosya tutulur (default 7), eskiler silinir.
 *  - Dosya formatı: `klab-YYYY-MM-DD-HHMMSS.db`
 *
 * Manual run: `npm run backup` (script üzerinden).
 *
 * Restore: `npm run restore -- <path-to-backup.db>` — yeni bir helper script.
 *
 * Güvenlik:
 *  - Backup dosyaları 0o600 izinlerle yazılır (data_security §1).
 *  - Production'da off-site (S3/Azure Blob) gönderim önerilir.
 */
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, chmodSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { config } from '../config/env';
import { getDb } from '../db/schema';
import { logger } from '../utils/logger';

interface BackupConfig {
  /** Saat cinsinden backup periyodu. */
  intervalHours: number;
  /** Kaç backup dosyası saklansın. */
  keepCount: number;
}

const DEFAULT_CONFIG: BackupConfig = {
  intervalHours: 24,
  keepCount: 7,
};

function getBackupDir(): string {
  const dbPath = resolve(process.cwd(), config.dbPath);
  return join(dirname(dbPath), 'backups');
}

function isoSafe(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

export async function runBackupOnce(): Promise<{ file: string; sizeBytes: number }> {
  const db = getDb();
  const dir = getBackupDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });

  const file = join(dir, `klab-${isoSafe()}.db`);
  // better-sqlite3 backup — atomic snapshot kopyası
  await db.backup(file);
  try {
    chmodSync(file, 0o600);
  } catch {
    /* ignore on platforms without chmod support */
  }
  const sizeBytes = statSync(file).size;
  logger.info('db_backup_created', { file, sizeBytes });
  return { file, sizeBytes };
}

export function pruneBackups(keepCount = DEFAULT_CONFIG.keepCount): number {
  const dir = getBackupDir();
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('klab-') && f.endsWith('.db'))
    .map((f) => ({ f, path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  const toDelete = files.slice(keepCount);
  for (const item of toDelete) {
    try {
      unlinkSync(item.path);
    } catch (err) {
      logger.warn('backup_prune_failed', { file: item.path, err: (err as Error).message });
    }
  }
  if (toDelete.length > 0) {
    logger.info('backup_pruned', { deleted: toDelete.length });
  }
  return toDelete.length;
}

export function listBackups(): Array<{ file: string; sizeBytes: number; createdAt: string }> {
  const dir = getBackupDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith('klab-') && f.endsWith('.db'))
    .map((f) => {
      const path = join(dir, f);
      const stat = statSync(path);
      return {
        file: f,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}

let timer: NodeJS.Timeout | null = null;

export function startBackupCron(config: Partial<BackupConfig> = {}): void {
  if (timer) return;
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const intervalMs = cfg.intervalHours * 60 * 60 * 1000;

  // Server start sonrası 60sn bekle
  setTimeout(() => {
    runBackupOnce()
      .then(() => pruneBackups(cfg.keepCount))
      .catch((err) =>
        logger.warn('backup_initial_failed', { err: (err as Error).message })
      );
  }, 60_000);

  timer = setInterval(() => {
    runBackupOnce()
      .then(() => pruneBackups(cfg.keepCount))
      .catch((err) =>
        logger.warn('backup_cron_failed', { err: (err as Error).message })
      );
  }, intervalMs);
}

export function stopBackupCron(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
