/**
 * DB backup servisi — yalnız PostgreSQL.
 *
 * PostgreSQL'de uygulama-içi atomic snapshot YOKTUR; backup pg_dump /
 * pg_basebackup / managed servis (RDS, Cloud SQL, Azure DB) ile yapılır.
 * Bu servis pg'de NO-OP'tur — arayüz (route + cron) korunur ama dosya yazmaz.
 *
 * Production öneri: yönetilen otomatik yedek + off-site (S3/Blob) saklama.
 */
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

export async function runBackupOnce(): Promise<{ file: string; sizeBytes: number }> {
  logger.info('db_backup_skipped_pg', { note: 'pg backup pg_dump/managed ile yapılır' });
  return { file: '', sizeBytes: 0 };
}

export function pruneBackups(_keepCount = DEFAULT_CONFIG.keepCount): number {
  return 0;
}

export function listBackups(): Array<{ file: string; sizeBytes: number; createdAt: string }> {
  return [];
}

export function startBackupCron(_config: Partial<BackupConfig> = {}): void {
  // pg: uygulama-içi backup yok — cron no-op (managed/pg_dump kullanılır).
}

export function stopBackupCron(): void {
  // no-op (cron çalışmıyor)
}
