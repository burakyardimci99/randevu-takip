/**
 * Lisans TALEP iş akışı.
 *
 * Bu servis booking iş akışıyla aynı paterni izler:
 *   pending → approved | rejected | feedback_requested
 *
 * Kullanıcı talep oluşturur (önerilen katalogdan veya custom),
 * admin review eder (onay / red / revize iste).
 *
 * Bu servis read-only `license.service.ts`'ten AYRI — o servis booking
 * `technologies` alanından kullanım analizi türetir, bu ise gerçek talep
 * akışı (kuyruğa giren, admin tarafından review edilen kayıtlar).
 *
 * Güvenlik (app_security.md):
 * - SQL parameterized (§3)
 * - IDOR: user sadece kendi taleplerini görür (§5)
 * - Admin review reviewed_by + reviewed_at ile audit-able (§8)
 */
import { nanoid } from 'nanoid';
import { getDb } from '../db/schema';
import { HttpError } from '../middleware/error.middleware';
import { LICENSE_CATALOG, type LicenseInfo } from './license.service';

export type LicenseRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'feedback_requested';

export interface LicenseRequest {
  id: string;
  userId: string;
  licenseKey: string;
  licenseName: string;
  vendor: string | null;
  category: string | null;
  reason: string;
  durationMonths: 1 | 3 | 6 | 12;
  status: LicenseRequestStatus;
  adminFeedback: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LicenseRequestWithUser extends LicenseRequest {
  userFullName: string;
  userEmail: string;
  userDepartment: string | null;
  reviewerName: string | null;
}

interface DbRow {
  id: string;
  user_id: string;
  license_key: string;
  license_name: string;
  vendor: string | null;
  category: string | null;
  reason: string;
  duration_months: 1 | 3 | 6 | 12;
  status: LicenseRequestStatus;
  admin_feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DbRowWithUser extends DbRow {
  user_full_name: string;
  user_email: string;
  user_department: string | null;
  reviewer_name: string | null;
}

function rowToLicenseRequest(row: DbRow): LicenseRequest {
  return {
    id: row.id,
    userId: row.user_id,
    licenseKey: row.license_key,
    licenseName: row.license_name,
    vendor: row.vendor,
    category: row.category,
    reason: row.reason,
    durationMonths: row.duration_months,
    status: row.status,
    adminFeedback: row.admin_feedback,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToLicenseRequestWithUser(row: DbRowWithUser): LicenseRequestWithUser {
  return {
    ...rowToLicenseRequest(row),
    userFullName: row.user_full_name,
    userEmail: row.user_email,
    userDepartment: row.user_department,
    reviewerName: row.reviewer_name,
  };
}

/* ============================================================
 * KATALOG ENDPOINT — popüler araçlar listesi (frontend dropdown)
 * ============================================================ */

export interface CatalogEntry {
  key: string;
  name: string;
  vendor: string;
  category: string;
  tier: 'paid' | 'free' | 'enterprise';
  monthlyUsd: number;
}

/**
 * UI'da gösterilecek katalog — sadece paid/enterprise + sık talep edilenler.
 * Bilinmeyen / custom için "Diğer" girdisini frontend ekler.
 */
export function getLicenseCatalog(): CatalogEntry[] {
  const seen = new Set<string>();
  const entries: CatalogEntry[] = [];

  // Önce paid + AI Assistant + IDE'leri öne çıkar (sık talep edilenler)
  const priority = ['claude', 'claude code', 'cursor', 'github copilot', 'gpt', 'openai', 'gemini'];
  for (const key of priority) {
    const info = LICENSE_CATALOG[key];
    if (info && !seen.has(info.name)) {
      seen.add(info.name);
      entries.push({
        key,
        name: info.name,
        vendor: info.vendor,
        category: info.category,
        tier: info.tier,
        monthlyUsd: info.monthlyUsd,
      });
    }
  }

  // Sonra geri kalan paid'ler
  for (const [key, info] of Object.entries(LICENSE_CATALOG) as Array<[string, LicenseInfo]>) {
    if (info.tier !== 'paid') continue;
    if (seen.has(info.name)) continue;
    seen.add(info.name);
    entries.push({
      key,
      name: info.name,
      vendor: info.vendor,
      category: info.category,
      tier: info.tier,
      monthlyUsd: info.monthlyUsd,
    });
  }

  return entries;
}

/* ============================================================
 * USER — talep oluştur + kendi taleplerini listele
 * ============================================================ */

export interface CreateLicenseRequestInput {
  /** Katalog key'i (örn. 'cursor') veya 'custom'. */
  licenseKey: string;
  /** Görüntü adı — katalogdan veya custom için kullanıcı yazısı. */
  licenseName: string;
  /** Custom için kullanıcı doldurabilir; katalog için frontend gönderebilir. */
  vendor?: string | null;
  category?: string | null;
  /** Talep gerekçesi (zorunlu). */
  reason: string;
  durationMonths: 1 | 3 | 6 | 12;
}

export function createLicenseRequest(
  userId: string,
  input: CreateLicenseRequestInput
): LicenseRequest {
  const db = getDb();

  // Custom değilse katalogdan vendor/category fill et (frontend zaten yollar
  // ama backend defense-in-depth: katalog key'i geçerli ise oradan al).
  const fromCatalog = LICENSE_CATALOG[input.licenseKey.trim().toLowerCase()];
  const vendor = fromCatalog?.vendor ?? input.vendor?.trim() ?? null;
  const category = fromCatalog?.category ?? input.category?.trim() ?? null;
  const licenseName = fromCatalog?.name ?? input.licenseName.trim();

  const id = nanoid();
  db.prepare(
    `INSERT INTO license_requests
       (id, user_id, license_key, license_name, vendor, category,
        reason, duration_months, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
  ).run(
    id,
    userId,
    input.licenseKey.trim().toLowerCase(),
    licenseName,
    vendor,
    category,
    input.reason.trim(),
    input.durationMonths
  );

  const row = db
    .prepare('SELECT * FROM license_requests WHERE id = ?')
    .get(id) as DbRow;
  return rowToLicenseRequest(row);
}

export function listUserLicenseRequests(userId: string): LicenseRequest[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM license_requests
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .all(userId) as DbRow[];
  return rows.map(rowToLicenseRequest);
}

/* ============================================================
 * ADMIN — tüm talepler + review
 * ============================================================ */

export function listAdminLicenseRequests(
  statusFilter?: LicenseRequestStatus
): LicenseRequestWithUser[] {
  const db = getDb();
  const params: unknown[] = [];
  let where = '';
  if (statusFilter) {
    where = 'WHERE lr.status = ?';
    params.push(statusFilter);
  }

  const rows = db
    .prepare(
      `SELECT lr.*,
              u.full_name AS user_full_name,
              u.email AS user_email,
              u.department AS user_department,
              a.full_name AS reviewer_name
       FROM license_requests lr
       INNER JOIN users u ON u.id = lr.user_id
       LEFT JOIN admins a ON a.id = lr.reviewed_by
       ${where}
       ORDER BY
         CASE lr.status
           WHEN 'pending' THEN 0
           WHEN 'feedback_requested' THEN 1
           ELSE 2
         END,
         lr.created_at DESC`
    )
    .all(...params) as DbRowWithUser[];
  return rows.map(rowToLicenseRequestWithUser);
}

export type ReviewAction = 'approve' | 'reject' | 'request_feedback';

export interface ReviewLicenseRequestInput {
  action: ReviewAction;
  /** Opsiyonel ama feedback_requested ve rejected için önerilir. */
  adminFeedback?: string | null;
}

export function reviewLicenseRequest(
  reviewerId: string,
  requestId: string,
  input: ReviewLicenseRequestInput
): LicenseRequestWithUser {
  const db = getDb();

  const existing = db
    .prepare('SELECT * FROM license_requests WHERE id = ?')
    .get(requestId) as DbRow | undefined;

  if (!existing) {
    throw new HttpError(404, 'Talep bulunamadı.', 'LICENSE_REQUEST_NOT_FOUND');
  }

  // Sadece 'pending' veya 'feedback_requested' durumdaki talepler review edilebilir.
  // Onaylanan/Reddedilen kayıtlar dondurulur.
  if (existing.status === 'approved' || existing.status === 'rejected') {
    throw new HttpError(
      400,
      'Bu talep zaten sonuçlandırılmış.',
      'LICENSE_REQUEST_FINALIZED'
    );
  }

  const nextStatus: LicenseRequestStatus =
    input.action === 'approve'
      ? 'approved'
      : input.action === 'reject'
        ? 'rejected'
        : 'feedback_requested';

  db.prepare(
    `UPDATE license_requests SET
       status = ?,
       admin_feedback = ?,
       reviewed_by = ?,
       reviewed_at = CURRENT_TIMESTAMP,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(nextStatus, input.adminFeedback ?? null, reviewerId, requestId);

  const updated = db
    .prepare(
      `SELECT lr.*,
              u.full_name AS user_full_name,
              u.email AS user_email,
              u.department AS user_department,
              a.full_name AS reviewer_name
       FROM license_requests lr
       INNER JOIN users u ON u.id = lr.user_id
       LEFT JOIN admins a ON a.id = lr.reviewed_by
       WHERE lr.id = ?`
    )
    .get(requestId) as DbRowWithUser;
  return rowToLicenseRequestWithUser(updated);
}
