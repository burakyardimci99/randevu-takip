/**
 * Manual DB backup script.
 *
 * Kullanım:
 *   npm run backup
 *
 * Backup dosyası: data/backups/klab-YYYY-MM-DD-HHMMSS.db
 */
import { config as loadEnv } from 'dotenv';
loadEnv();

import { runBackupOnce, pruneBackups, listBackups } from '../src/services/backup.service';

async function main(): Promise<void> {
  const result = await runBackupOnce();
  const deleted = pruneBackups();
  console.log(`✓ Backup: ${result.file}`);
  console.log(`  Boyut: ${(result.sizeBytes / 1024).toFixed(1)} KB`);
  if (deleted > 0) console.log(`  Eski backuplar silindi: ${deleted}`);

  console.log('\nMevcut backups:');
  for (const b of listBackups()) {
    console.log(`  ${b.file}  ${(b.sizeBytes / 1024).toFixed(1)} KB  ${b.createdAt}`);
  }
}

main().catch((err) => {
  console.error('Backup başarısız:', err);
  process.exit(1);
});
