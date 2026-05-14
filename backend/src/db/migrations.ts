/**
 * Versiyonlu DB migration sistemi.
 *
 * Güvenlik / Operasyon:
 * - data_security.md §11: Master data schema değişikliği versiyonlanır.
 * - Idempotent: aynı migration iki kez koşmaz (schema_migrations tablosu).
 * - Transactional: her migration tek atomic txn içinde, başarısızsa rollback.
 * - data_security.md §1: Migration SQL string concat YASAK, hep prepared statement.
 */
import type Database from 'better-sqlite3';

export interface Migration {
  id: string;
  name: string;
  up: (db: Database.Database) => void;
}

/**
 * Migration listesi — sırası ÖNEMLİ.
 * Yeni migration için: en alta ekle, eskileri DEĞİŞTİRME.
 */
const MIGRATIONS: Migration[] = [
  {
    id: '0001',
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user' CHECK(role = 'user'),
          department TEXT,
          title TEXT,
          manager TEXT,
          phone TEXT,
          bio TEXT,
          project_idea TEXT,
          failed_login_count INTEGER NOT NULL DEFAULT 0,
          locked_until DATETIME,
          status INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE status != 3;

        CREATE TABLE IF NOT EXISTS admins (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin', 'super_admin')),
          failed_login_count INTEGER NOT NULL DEFAULT 0,
          locked_until DATETIME,
          status INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email) WHERE status != 3;

        CREATE TABLE IF NOT EXISTS rooms (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          district TEXT NOT NULL,
          neighborhood TEXT NOT NULL,
          capacity INTEGER NOT NULL DEFAULT 4,
          description TEXT,
          theme TEXT NOT NULL DEFAULT 'agent',
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bookings (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          room_id TEXT NOT NULL,
          period_months INTEGER NOT NULL CHECK(period_months IN (1, 2, 3)),
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          project_name TEXT NOT NULL,
          project_description TEXT NOT NULL,
          help_needed TEXT NOT NULL,
          technologies TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK(status IN ('pending', 'approved', 'rejected', 'feedback_requested')),
          admin_feedback TEXT,
          reviewed_by TEXT,
          reviewed_at DATETIME,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
          FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT,
          FOREIGN KEY (reviewed_by) REFERENCES admins(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
        CREATE INDEX IF NOT EXISTS idx_bookings_room ON bookings(room_id);
        CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
        CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(room_id, start_date, end_date);

        CREATE TABLE IF NOT EXISTS refresh_tokens (
          id TEXT PRIMARY KEY,
          token_hash TEXT NOT NULL UNIQUE,
          subject_id TEXT NOT NULL,
          subject_type TEXT NOT NULL CHECK(subject_type IN ('user', 'admin')),
          expires_at DATETIME NOT NULL,
          revoked INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_refresh_subject ON refresh_tokens(subject_id, subject_type);
        CREATE INDEX IF NOT EXISTS idx_refresh_hash ON refresh_tokens(token_hash);

        CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          subject_id TEXT,
          subject_type TEXT,
          ip_address TEXT,
          user_agent TEXT,
          success INTEGER NOT NULL,
          details TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_audit_event ON audit_logs(event_type, created_at);
        CREATE INDEX IF NOT EXISTS idx_audit_subject ON audit_logs(subject_id, subject_type);
      `);
    },
  },
  {
    id: '0002',
    name: 'refresh_token_reuse_detection',
    up: (db) => {
      // Refresh token rotation: parent_id chain ile reuse tespit
      db.exec(`
        ALTER TABLE refresh_tokens ADD COLUMN parent_id TEXT;
        ALTER TABLE refresh_tokens ADD COLUMN used_at DATETIME;
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_refresh_parent ON refresh_tokens(parent_id);`);
    },
  },
  {
    id: '0003',
    name: 'admin_mfa',
    up: (db) => {
      db.exec(`
        ALTER TABLE admins ADD COLUMN totp_secret TEXT;
        ALTER TABLE admins ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE admins ADD COLUMN totp_backup_codes TEXT;
      `);
    },
  },
  {
    id: '0004',
    name: 'waitlist',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS waitlist (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          room_id TEXT NOT NULL,
          period_months INTEGER NOT NULL CHECK(period_months IN (1, 2, 3)),
          desired_start_date DATE NOT NULL,
          project_name TEXT NOT NULL,
          project_description TEXT NOT NULL,
          help_needed TEXT NOT NULL,
          technologies TEXT NOT NULL,
          position INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'waiting'
            CHECK(status IN ('waiting', 'promoted', 'expired', 'cancelled')),
          promoted_booking_id TEXT,
          notified_at DATETIME,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
          FOREIGN KEY (promoted_booking_id) REFERENCES bookings(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_waitlist_room ON waitlist(room_id, status, position);
        CREATE INDEX IF NOT EXISTS idx_waitlist_user ON waitlist(user_id, status);
      `);
    },
  },
  {
    id: '0005',
    name: 'project_embeddings',
    up: (db) => {
      // Semantic search için: embedding vektörünü JSON array olarak saklarız.
      // Boyut sabit (sentence-transformers/all-MiniLM-L6-v2 → 384 dim).
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_embeddings (
          booking_id TEXT PRIMARY KEY,
          embedding TEXT NOT NULL,
          model TEXT NOT NULL,
          dim INTEGER NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
        );
      `);
    },
  },
  {
    id: '0006',
    name: 'showcase_meta',
    up: (db) => {
      // Onaylanan bookings için showcase görünürlüğü ve etiketleme.
      db.exec(`
        ALTER TABLE bookings ADD COLUMN showcase_visible INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE bookings ADD COLUMN showcase_highlight INTEGER NOT NULL DEFAULT 0;
      `);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_bookings_showcase ON bookings(status, showcase_visible) WHERE status = 'approved';`);
    },
  },
  {
    id: '0007',
    name: 'profile_photo',
    up: (db) => {
      // users.profile_photo: küçük base64 data URL (JPEG, max 200KB).
      // PII (data_security §1): sadece kullanıcı kendisi yükler, public profilde gösterilir.
      db.exec(`
        ALTER TABLE users ADD COLUMN profile_photo TEXT;
      `);
    },
  },
  {
    id: '0008',
    name: 'booking_messages',
    up: (db) => {
      // Admin <-> User mesajlaşma thread'i (her booking için).
      db.exec(`
        CREATE TABLE IF NOT EXISTS booking_messages (
          id TEXT PRIMARY KEY,
          booking_id TEXT NOT NULL,
          author_id TEXT NOT NULL,
          author_type TEXT NOT NULL CHECK(author_type IN ('user', 'admin')),
          author_name TEXT NOT NULL,
          body TEXT NOT NULL,
          read_by_recipient INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_booking_messages_booking ON booking_messages(booking_id, created_at);
      `);
    },
  },
  {
    id: '0009',
    name: 'showcase_likes_comments',
    up: (db) => {
      // Galeride beğeni + yorum.
      // showcase_likes: user_id + booking_id UNIQUE → bir user bir projeye 1 beğeni.
      db.exec(`
        CREATE TABLE IF NOT EXISTS showcase_likes (
          id TEXT PRIMARY KEY,
          booking_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(booking_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_showcase_likes_booking ON showcase_likes(booking_id);

        CREATE TABLE IF NOT EXISTS showcase_comments (
          id TEXT PRIMARY KEY,
          booking_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          user_full_name TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_showcase_comments_booking ON showcase_comments(booking_id, created_at);
      `);
    },
  },
  {
    id: '0010',
    name: 'license_requests',
    up: (db) => {
      // Kullanıcılar Cursor/Claude/Copilot vb. lisans talebi gönderir,
      // admin onaylar/reddeder/revize ister (booking iş akışıyla aynı).
      //
      // license_key: LICENSE_CATALOG'tan normalize key (örn. 'cursor', 'claude')
      //              veya 'custom' (kullanıcı serbest yazdıysa).
      // license_name: görüntü adı (katalogdan veya kullanıcı girdisi).
      // vendor / category: katalogdan gelir; custom için kullanıcı doldurabilir.
      // duration_months: 1/3/6/12 — abonelik periyodu.
      db.exec(`
        CREATE TABLE IF NOT EXISTS license_requests (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          license_key TEXT NOT NULL,
          license_name TEXT NOT NULL,
          vendor TEXT,
          category TEXT,
          reason TEXT NOT NULL,
          duration_months INTEGER NOT NULL CHECK(duration_months IN (1, 3, 6, 12)),
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK(status IN ('pending', 'approved', 'rejected', 'feedback_requested')),
          admin_feedback TEXT,
          reviewed_by TEXT,
          reviewed_at DATETIME,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
          FOREIGN KEY (reviewed_by) REFERENCES admins(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_license_requests_user ON license_requests(user_id);
        CREATE INDEX IF NOT EXISTS idx_license_requests_status ON license_requests(status);
      `);
    },
  },
];

export function runMigrations(db: Database.Database): { applied: string[] } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied: string[] = [];
  const existing = db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: string }>;
  const appliedIds = new Set(existing.map((r) => r.id));

  for (const migration of MIGRATIONS) {
    if (appliedIds.has(migration.id)) continue;

    const txn = db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (id, name) VALUES (?, ?)').run(
        migration.id,
        migration.name
      );
    });

    try {
      txn();
      applied.push(`${migration.id}_${migration.name}`);
    } catch (err) {
      throw new Error(
        `Migration ${migration.id}_${migration.name} failed: ${(err as Error).message}`
      );
    }
  }

  return { applied };
}
