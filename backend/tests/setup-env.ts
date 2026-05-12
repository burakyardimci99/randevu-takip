/**
 * Vitest için ortak setup — testlerde main config'den DB ve key yollarını override eder.
 *
 * NOT: Bu dosya `import` edildiği anda `process.env`'i set eder.
 * Bütün test dosyaları en üstte bunu import etmeli:
 *   import './setup-env';
 */
import { resolve } from 'node:path';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';

// Test DB: her test run için izole + temizlenebilir
const TEST_DB = resolve(process.cwd(), 'data/klab-test.db');

// Veri dizini oluştur
const dataDir = resolve(process.cwd(), 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

// Eski test DB'yi sil (clean start)
for (const ext of ['', '-shm', '-wal']) {
  const p = `${TEST_DB}${ext}`;
  if (existsSync(p)) {
    try {
      unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

// Test için env override — gerçek .env'yi etkilemez
process.env.NODE_ENV = 'development';
process.env.DB_PATH = TEST_DB;
process.env.CSRF_SECRET = 'test_csrf_secret_minimum_32_chars_value_aaaa';
process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
// Mevcut key yollarını koru (üretilmiş key'ler var)
process.env.USER_JWT_PRIVATE_KEY_PATH ??= './keys/user_private.pem';
process.env.USER_JWT_PUBLIC_KEY_PATH ??= './keys/user_public.pem';
process.env.ADMIN_JWT_PRIVATE_KEY_PATH ??= './keys/admin_private.pem';
process.env.ADMIN_JWT_PUBLIC_KEY_PATH ??= './keys/admin_public.pem';
