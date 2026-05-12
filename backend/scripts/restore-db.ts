/**
 * DB restore script.
 *
 * Kullanım:
 *   npm run restore -- <backup-dosya-yolu>
 *
 * Güvenlik:
 *  - Mevcut DB'yi `.db.before-restore-<timestamp>` olarak yedekler (geri alabilmek için).
 *  - Server kapalıyken çalıştırılmalı (WAL-active DB'yi overwrite etmek tutarsızlık).
 *  - Sadece dev/admin makinesinde çalıştırılır.
 */
import { config } from 'dotenv';
import { copyFileSync, existsSync, statSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

config();

function main(): void {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Kullanım: npm run restore -- <backup-dosyası>');
    process.exit(2);
  }

  const source = resolve(process.cwd(), arg);
  if (!existsSync(source)) {
    console.error(`Backup bulunamadı: ${source}`);
    process.exit(3);
  }

  const sizeBytes = statSync(source).size;
  if (sizeBytes < 100) {
    console.error(`Backup şüpheli derecede küçük (${sizeBytes} byte). Restore iptal.`);
    process.exit(4);
  }

  const dbPath = process.env.DB_PATH ?? './data/klab.db';
  const target = resolve(process.cwd(), dbPath);

  // Önce mevcut DB'yi yedekle
  if (existsSync(target)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const before = `${target}.before-restore-${ts}`;
    renameSync(target, before);
    console.log(`Mevcut DB yedeklendi: ${before}`);
    // WAL & SHM dosyalarını da yedekle (varsa)
    for (const ext of ['-shm', '-wal']) {
      const p = `${target}${ext}`;
      if (existsSync(p)) renameSync(p, `${before}${ext}`);
    }
  }

  copyFileSync(source, target);
  console.log(`✓ Restore tamamlandı: ${source} → ${target}`);
  console.log(`  Boyut: ${sizeBytes} byte`);
  console.log('Server'ı yeniden başlatın.');
}

main();
