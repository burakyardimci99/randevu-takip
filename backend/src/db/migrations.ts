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
  {
    id: '0011',
    name: 'license_requests_extended_fields',
    up: (db) => {
      // PNG "Başvuru Formu" alanlarını entegre eden genişletme.
      //
      // Yeni alanlar (hepsi nullable — eski kayıtlarla uyumluluk):
      //   request_title         : Talep adı (kısa başlık)
      //   expected_benefit      : Beklenen ölçülebilir fayda
      //   success_criteria      : Başarı kriterleri / metrik
      //   project_type          : 'poc' | 'integration'
      //   estimated_duration_days : Projenin tamamlanma tahmini (gün, opsiyonel)
      //   data_to_use           : Kullanılacak veri (kaynak, sentetik mi vb.)
      //   technical_stack       : Tercih edilen dil / framework / db (opsiyonel)
      //
      // NOT: Mevcut `reason` kolonu artık "Kullanım Amacı" anlamında
      // kullanılacak — frontend etiketi değişir, kolon kalır.
      //
      // Çoklu AI aracı / lisans için ayrı junction tablosu (license_request_items).
      // Eski kayıtlardaki license_key/name/vendor/category değerleri buraya
      // bir satır olarak backfill edilir; eski kolonlar geriye dönük olarak
      // okuma için kalır ama yeni kayıtlarda ilk item ile aynı değeri tutar.
      db.exec(`
        ALTER TABLE license_requests ADD COLUMN request_title TEXT;
        ALTER TABLE license_requests ADD COLUMN expected_benefit TEXT;
        ALTER TABLE license_requests ADD COLUMN success_criteria TEXT;
        ALTER TABLE license_requests ADD COLUMN project_type TEXT
          CHECK(project_type IS NULL OR project_type IN ('poc', 'integration'));
        ALTER TABLE license_requests ADD COLUMN estimated_duration_days INTEGER
          CHECK(estimated_duration_days IS NULL OR (estimated_duration_days BETWEEN 1 AND 365));
        ALTER TABLE license_requests ADD COLUMN data_to_use TEXT;
        ALTER TABLE license_requests ADD COLUMN technical_stack TEXT;

        CREATE TABLE IF NOT EXISTS license_request_items (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL,
          license_key TEXT NOT NULL,
          license_name TEXT NOT NULL,
          vendor TEXT,
          category TEXT,
          item_order INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (request_id) REFERENCES license_requests(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_license_request_items_request
          ON license_request_items(request_id, item_order);
      `);

      // Backfill: eski tek-lisans kayıtlarını items tablosuna aktar.
      db.exec(`
        INSERT INTO license_request_items
          (id, request_id, license_key, license_name, vendor, category, item_order)
        SELECT
          lower(hex(randomblob(8))),
          id,
          license_key,
          license_name,
          vendor,
          category,
          0
        FROM license_requests
        WHERE NOT EXISTS (
          SELECT 1 FROM license_request_items i WHERE i.request_id = license_requests.id
        );
      `);
    },
  },
  {
    id: '0012',
    name: 'notifications',
    up: (db) => {
      // Kalıcı in-app bildirim merkezi.
      //
      // recipient_id + recipient_type: bildirim sahibi (user veya admin).
      // category: ikon + gruplama için ('booking' | 'license' | 'waitlist'
      //           | 'message' | 'system').
      // link: tıklanınca yönlendirilecek frontend rotası (opsiyonel).
      // read: 0/1 — okunma durumu.
      //
      // SSE anlık bildirim sağlar; bu tablo kalıcılık sağlar (kullanıcı
      // çevrimdışıyken oluşan olaylar da sonradan görünür).
      db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          recipient_id TEXT NOT NULL,
          recipient_type TEXT NOT NULL CHECK(recipient_type IN ('user', 'admin')),
          category TEXT NOT NULL
            CHECK(category IN ('booking', 'license', 'waitlist', 'message', 'system')),
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          link TEXT,
          read INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_recipient
          ON notifications(recipient_id, recipient_type, read, created_at);
      `);
    },
  },
  {
    id: '0013',
    name: 'password_reset_tokens',
    up: (db) => {
      // Şifre sıfırlama: tek kullanımlık, süreli token.
      //
      // token_hash: ham token SHA-256 ile saklanır (refresh_tokens paterni).
      //             Ham token sadece e-posta linkinde gider, DB'de tutulmaz.
      // expires_at: kısa ömür (servis 1 saat verir).
      // used_at:    tek kullanımlık — sıfırlama sonrası işaretlenir.
      db.exec(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at DATETIME NOT NULL,
          used_at DATETIME,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_password_reset_hash
          ON password_reset_tokens(token_hash);
        CREATE INDEX IF NOT EXISTS idx_password_reset_user
          ON password_reset_tokens(user_id);
      `);
    },
  },
  {
    id: '0014',
    name: 'license_requests_governance',
    up: (db) => {
      // AI Lab Vibe Coding Yönetişim Kılavuzu v2.1 entegrasyonu.
      //
      // Başvuru (license_requests) artık bir "proje" yaşam döngüsü taşır:
      //   application → development → stage → production → live
      //
      // lifecycle_stage : projenin 4 aşamalı yaşam döngüsündeki konumu.
      //                   'application' iken status (pending/approved/...) geçerli;
      //                   onaylanınca 'development'e ilerler.
      // review_track    : 'standard' | 'swat' — SWAT multidisipliner inceleme kuyruğu.
      // governance_level: 'basic' (PoC) | 'full' (Kuruma Entegre) — uygulanacak
      //                   kalite kapısı setini belirler.
      // uses_external_api  : başvuru formu — dış servis/API erişimi var mı.
      // involves_real_data : başvuru formu — gerçek banka verisi / üretim / AD-LDAP
      //                      beyanı. true ise otomatik red (kılavuz §5).
      // stage_entered_at   : mevcut lifecycle_stage'e giriş zamanı (SLA hesabı).
      // assigned_engineer_id : atanan Lab Mühendisi (admins).
      db.exec(`
        ALTER TABLE license_requests ADD COLUMN lifecycle_stage TEXT NOT NULL
          DEFAULT 'application'
          CHECK(lifecycle_stage IN ('application','development','stage','production','live'));
        ALTER TABLE license_requests ADD COLUMN review_track TEXT NOT NULL
          DEFAULT 'standard'
          CHECK(review_track IN ('standard','swat'));
        ALTER TABLE license_requests ADD COLUMN governance_level TEXT NOT NULL
          DEFAULT 'basic'
          CHECK(governance_level IN ('basic','full'));
        ALTER TABLE license_requests ADD COLUMN uses_external_api INTEGER;
        ALTER TABLE license_requests ADD COLUMN involves_real_data INTEGER;
        ALTER TABLE license_requests ADD COLUMN stage_entered_at DATETIME;
        ALTER TABLE license_requests ADD COLUMN assigned_engineer_id TEXT
          REFERENCES admins(id) ON DELETE SET NULL;
      `);

      // Backfill: Kuruma Entegre projeler 'full' yönetişim seviyesinde.
      db.exec(`
        UPDATE license_requests SET governance_level = 'full'
        WHERE project_type = 'integration';
      `);
      // Backfill: zaten onaylanmış başvurular geliştirme aşamasında sayılır.
      db.exec(`
        UPDATE license_requests
        SET lifecycle_stage = 'development',
            stage_entered_at = COALESCE(reviewed_at, created_at)
        WHERE status = 'approved';
      `);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_license_requests_lifecycle
          ON license_requests(lifecycle_stage);
        CREATE INDEX IF NOT EXISTS idx_license_requests_track
          ON license_requests(review_track);
      `);
    },
  },
  {
    id: '0015',
    name: 'governance_tables',
    up: (db) => {
      // project_stage_events : yaşam döngüsü geçiş geçmişi (audit zaman çizelgesi).
      // quality_gates        : 6 yönetişim ajanının kalite kapısı sonuçları.
      // human_approvals      : Stage + Production insan onay noktaları.
      db.exec(`
        CREATE TABLE IF NOT EXISTS project_stage_events (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL,
          from_stage TEXT,
          to_stage TEXT NOT NULL,
          actor_id TEXT,
          actor_type TEXT CHECK(actor_type IS NULL OR actor_type IN ('user','admin','system')),
          note TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (request_id) REFERENCES license_requests(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_stage_events_request
          ON project_stage_events(request_id, created_at);

        CREATE TABLE IF NOT EXISTS quality_gates (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL,
          gate_key TEXT NOT NULL
            CHECK(gate_key IN ('build','code_review','architecture','framework','security')),
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK(status IN ('pending','passed','failed')),
          score INTEGER,
          threshold INTEGER,
          detail TEXT,
          evaluated_at DATETIME,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (request_id) REFERENCES license_requests(id) ON DELETE CASCADE,
          UNIQUE(request_id, gate_key)
        );
        CREATE INDEX IF NOT EXISTS idx_quality_gates_request
          ON quality_gates(request_id);

        CREATE TABLE IF NOT EXISTS human_approvals (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL,
          approval_type TEXT NOT NULL CHECK(approval_type IN ('stage','production')),
          decision TEXT NOT NULL DEFAULT 'pending'
            CHECK(decision IN ('pending','approved','rejected')),
          approver_id TEXT,
          release_note TEXT,
          risk_assessment TEXT,
          decided_at DATETIME,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (request_id) REFERENCES license_requests(id) ON DELETE CASCADE,
          FOREIGN KEY (approver_id) REFERENCES admins(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_human_approvals_request
          ON human_approvals(request_id);
      `);
    },
  },
  {
    id: '0016',
    name: 'admin_governance_role',
    up: (db) => {
      // Kılavuz rolleri — admin'in temel rolüne (admin/super_admin) ek olarak
      // yönetişim sürecindeki sorumluluk rolü:
      //   analitik_danisman : başvuru değerlendirme
      //   lab_muhendisi     : ortam atama + teknik danışmanlık
      //   yz_arge           : Stage + Production onayı
      // super_admin tüm rollerin yetkisine sahiptir.
      db.exec(`
        ALTER TABLE admins ADD COLUMN governance_role TEXT
          CHECK(governance_role IS NULL OR
                governance_role IN ('analitik_danisman','lab_muhendisi','yz_arge'));
      `);
    },
  },
  {
    id: '0017',
    name: 'rooms_equipment',
    up: (db) => {
      // Resmi oda envanteri AILAB -1D zone'una geçtiğinde her odaya bir cihaz
      // bilgisi (NVIDIA DGX SPARK / MAC STUDIO / AI Deneyim Alanı) eklendi.
      // `capacity` zaten cihaz adedi ile aynı (1 ya da 2; deneyim alanı = 15 kişi).
      db.exec(`
        ALTER TABLE rooms ADD COLUMN equipment TEXT NOT NULL DEFAULT '';
      `);
    },
  },
  {
    id: '0018',
    name: 'bookings_lifecycle_stage',
    up: (db) => {
      // Booking onaylandığında proje 4 aşamalı yaşam döngüsüne girer:
      //   application  → talep aşaması (varsayılan)
      //   development  → onay sonrası proje geliştirme aşaması
      //   stage        → test/UAT
      //   production   → canlı öncesi son hazırlık
      //   live         → canlı / kullanımda
      // approve sırasında otomatik 'development'a geçer; sonraki ilerletmeler manuel.
      //
      // Not: SQLite ALTER TABLE ADD COLUMN default'larında non-constant ifadeler
      // (CURRENT_TIMESTAMP) yasak — bu yüzden boş string ile başlayıp ardından
      // UPDATE ile değer atıyoruz.
      db.exec(`
        ALTER TABLE bookings ADD COLUMN lifecycle_stage TEXT NOT NULL
          DEFAULT 'application'
          CHECK(lifecycle_stage IN ('application','development','stage','production','live'));
        ALTER TABLE bookings ADD COLUMN stage_entered_at DATETIME NOT NULL DEFAULT '';

        -- Tüm satırlara stage_entered_at = created_at varsayılanı.
        UPDATE bookings SET stage_entered_at = created_at WHERE stage_entered_at = '';

        -- Mevcut onaylı booking'leri development'a yükselt — eski demo verisinin
        -- yeni sisteme tutarlı geçişi için.
        UPDATE bookings
        SET lifecycle_stage = 'development',
            stage_entered_at = COALESCE(reviewed_at, updated_at, created_at)
        WHERE status = 'approved';

        CREATE INDEX IF NOT EXISTS idx_bookings_lifecycle
          ON bookings(lifecycle_stage);
      `);
    },
  },
  {
    id: '0019',
    name: 'appointments_table',
    up: (db) => {
      // Günlük ziyaret randevuları — onaylı bir booking'in tarih aralığı içinde
      // kullanıcı odaya gelmek istediği belirli saatleri rezerve eder.
      //
      // İlişki: bir booking N appointment içerir. Booking silinirse appointment'lar
      // CASCADE ile düşer. status='cancelled' soft-delete olarak da kullanılır.
      db.exec(`
        CREATE TABLE IF NOT EXISTS appointments (
          id TEXT PRIMARY KEY,
          booking_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          room_id TEXT NOT NULL,
          start_at DATETIME NOT NULL,
          end_at DATETIME NOT NULL,
          title TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'scheduled'
            CHECK(status IN ('scheduled','cancelled','completed')),
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
          FOREIGN KEY (room_id)    REFERENCES rooms(id)    ON DELETE CASCADE,
          CHECK(start_at < end_at)
        );
        CREATE INDEX IF NOT EXISTS idx_appointments_user
          ON appointments(user_id, start_at);
        CREATE INDEX IF NOT EXISTS idx_appointments_room
          ON appointments(room_id, start_at, end_at);
        CREATE INDEX IF NOT EXISTS idx_appointments_booking
          ON appointments(booking_id, status);
      `);
    },
  },
  {
    id: '0020',
    name: 'bookings_review_track_and_stage_advance',
    up: (db) => {
      // SWAT (fast-track) review için booking'lere `review_track` kolonu — daha önce
      // sadece license_requests'te vardı. Ek olarak kullanıcının "bir sonraki aşamaya
      // ilerlet" talebi için iki kolon: `stage_advance_requested_at` (timestamp) ve
      // `stage_advance_note` (opsiyonel sebep). Talep admin tarafından (a) ilerleterek
      // (b) geriletecek (c) reddederek kapatılır.
      db.exec(`
        ALTER TABLE bookings ADD COLUMN review_track TEXT NOT NULL
          DEFAULT 'standard'
          CHECK(review_track IN ('standard','swat'));
        ALTER TABLE bookings ADD COLUMN stage_advance_requested_at DATETIME;
        ALTER TABLE bookings ADD COLUMN stage_advance_note TEXT;

        CREATE INDEX IF NOT EXISTS idx_bookings_review_track
          ON bookings(review_track) WHERE review_track = 'swat';
        CREATE INDEX IF NOT EXISTS idx_bookings_advance_pending
          ON bookings(stage_advance_requested_at)
          WHERE stage_advance_requested_at IS NOT NULL;
      `);
    },
  },
  {
    id: '0021',
    name: 'users_governance_role',
    up: (db) => {
      // Kullanıcılara da yönetişim rolü eklendi — admin (Lab Mühendisi) yetkilerinin
      // bir kısmını Analitik Danışman ve YZ/Ar-Ge rolüne devretmek için.
      //   analitik_danisman → başvuru değerlendirme (license + booking review)
      //   yz_arge           → Stage + Production onayı + rollback
      // NULL = sıradan kullanıcı (mevcut davranış). Sadece admin atayabilir.
      db.exec(`
        ALTER TABLE users ADD COLUMN governance_role TEXT
          CHECK(governance_role IS NULL OR
                governance_role IN ('analitik_danisman','yz_arge'));
        CREATE INDEX IF NOT EXISTS idx_users_governance_role
          ON users(governance_role) WHERE governance_role IS NOT NULL;
      `);
    },
  },
  {
    id: '0022',
    name: 'refresh_tokens_subject_type_expand',
    up: (db) => {
      // refresh_tokens.subject_type'a 'danisman' ve 'arge' kind'ları eklendi.
      // SQLite CHECK constraint drop edilemez → tabloyu yeniden oluştur.
      db.exec(`
        CREATE TABLE refresh_tokens_new (
          id TEXT PRIMARY KEY,
          token_hash TEXT NOT NULL UNIQUE,
          subject_id TEXT NOT NULL,
          subject_type TEXT NOT NULL
            CHECK(subject_type IN ('user', 'admin', 'danisman', 'arge')),
          expires_at DATETIME NOT NULL,
          revoked INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          parent_id TEXT,
          used_at DATETIME
        );
        INSERT INTO refresh_tokens_new
          SELECT id, token_hash, subject_id, subject_type, expires_at, revoked,
                 created_at, parent_id, used_at
          FROM refresh_tokens;
        DROP TABLE refresh_tokens;
        ALTER TABLE refresh_tokens_new RENAME TO refresh_tokens;
        CREATE INDEX IF NOT EXISTS idx_refresh_subject
          ON refresh_tokens(subject_id, subject_type);
        CREATE INDEX IF NOT EXISTS idx_refresh_hash
          ON refresh_tokens(token_hash);
        CREATE INDEX IF NOT EXISTS idx_refresh_parent
          ON refresh_tokens(parent_id);
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
