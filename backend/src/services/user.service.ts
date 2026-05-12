/**
 * User profil & admin user management servisleri.
 *
 * Güvenlik:
 * - User: yalnızca kendi profilini görür/günceller (IDOR — app_security §5)
 * - Admin: tüm user'ları yönetebilir; ancak admins tablosunu DEĞİŞTİREMEZ (ayrı endpoint olmalı)
 * - Soft delete: status=3 (data_security §11) — booking history korunur
 * - Audit log: admin user değişiklikleri loglanır
 */
import { getDb } from '../db/schema';
import { HttpError } from '../middleware/error.middleware';
import type { AdminUserUpdateInput, ProfileUpdateInput } from '../validators/schemas';

export interface UserProfileDto {
  id: string;
  email: string;
  fullName: string;
  role: 'user';
  department: string | null;
  title: string | null;
  manager: string | null;
  phone: string | null;
  bio: string | null;
  projectIdea: string | null;
  status: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserListItemDto extends UserProfileDto {
  bookingCount: number;
  approvedBookingCount: number;
  pendingBookingCount: number;
  lastBookingAt: string | null;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: 'user';
  department: string | null;
  title: string | null;
  manager: string | null;
  phone: string | null;
  bio: string | null;
  project_idea: string | null;
  status: number;
  created_at: string;
  updated_at: string;
}

function toDto(r: UserRow): UserProfileDto {
  return {
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    role: r.role,
    department: r.department,
    title: r.title,
    manager: r.manager,
    phone: r.phone,
    bio: r.bio,
    projectIdea: r.project_idea,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const PROFILE_COLUMNS =
  'id, email, full_name, role, department, title, manager, phone, bio, project_idea, status, created_at, updated_at';

export function getUserProfile(userId: string): UserProfileDto {
  const row = getDb()
    .prepare(`SELECT ${PROFILE_COLUMNS} FROM users WHERE id = ? AND status != 3 LIMIT 1`)
    .get(userId) as UserRow | undefined;
  if (!row) throw new HttpError(404, 'Kullanıcı bulunamadı.', 'USER_NOT_FOUND');
  return toDto(row);
}

/**
 * Profil günceller. Sadece tanımlı alanlar değiştirilir (partial update).
 * E-posta, parola, role bu endpoint'ten değiştirilemez.
 */
export function updateUserProfile(userId: string, input: ProfileUpdateInput): UserProfileDto {
  const db = getDb();

  // Mevcut user var mı?
  const exists = db
    .prepare(`SELECT id FROM users WHERE id = ? AND status != 3 LIMIT 1`)
    .get(userId);
  if (!exists) throw new HttpError(404, 'Kullanıcı bulunamadı.', 'USER_NOT_FOUND');

  // Sadece undefined olmayan alanları güncelle
  const updates: string[] = [];
  const params: unknown[] = [];

  const fieldMap: Array<[keyof ProfileUpdateInput, string]> = [
    ['fullName', 'full_name'],
    ['department', 'department'],
    ['title', 'title'],
    ['manager', 'manager'],
    ['phone', 'phone'],
    ['bio', 'bio'],
    ['projectIdea', 'project_idea'],
  ];

  for (const [k, col] of fieldMap) {
    if (input[k] !== undefined) {
      updates.push(`${col} = ?`);
      params.push(input[k] ?? null);
    }
  }

  if (updates.length === 0) {
    return getUserProfile(userId);
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(userId);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getUserProfile(userId);
}

/* ============================================================
 * ADMIN — User Management
 * ============================================================ */

export interface UserSearchFilters {
  q?: string;
  status?: 'all' | 'active' | 'disabled';
  department?: string;
  hasBookings?: 'any' | 'yes' | 'no';
  limit?: number;
}

export function listAllUsers(filters: UserSearchFilters = {}): UserListItemDto[] {
  const db = getDb();
  const whereParts: string[] = [];
  const params: unknown[] = [];

  // Status filtresi
  if (filters.status === 'active') {
    whereParts.push('users.status = 1');
  } else if (filters.status === 'disabled') {
    whereParts.push('users.status = 3');
  }
  // 'all' veya undefined → kısıt yok

  // Department filter (exact match)
  if (filters.department && filters.department.trim()) {
    whereParts.push('LOWER(users.department) = LOWER(?)');
    params.push(filters.department.trim());
  }

  // Free text search — full_name, email, department, title (case-insensitive)
  if (filters.q && filters.q.trim().length > 0) {
    const like = `%${filters.q.trim().toLowerCase()}%`;
    whereParts.push(`(
      LOWER(users.full_name) LIKE ?
      OR LOWER(users.email) LIKE ?
      OR LOWER(IFNULL(users.department, '')) LIKE ?
      OR LOWER(IFNULL(users.title, '')) LIKE ?
    )`);
    params.push(like, like, like, like);
  }

  const where = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);

  const baseSql = `
    SELECT ${PROFILE_COLUMNS},
           (SELECT COUNT(*) FROM bookings b WHERE b.user_id = users.id) AS booking_count,
           (SELECT COUNT(*) FROM bookings b WHERE b.user_id = users.id AND b.status = 'approved') AS approved_count,
           (SELECT COUNT(*) FROM bookings b WHERE b.user_id = users.id AND b.status IN ('pending', 'feedback_requested')) AS pending_count,
           (SELECT MAX(created_at) FROM bookings b WHERE b.user_id = users.id) AS last_booking
    FROM users
    ${where}
    ORDER BY users.status ASC, users.created_at DESC
    LIMIT ?
  `;
  params.push(limit);

  let rows = db.prepare(baseSql).all(...params) as Array<
    UserRow & {
      booking_count: number;
      approved_count: number;
      pending_count: number;
      last_booking: string | null;
    }
  >;

  // hasBookings filtresi (post-filter — SQL subquery'i ile entegre etmek daha pahalı,
  // limit zaten sınırlı, in-memory filtreleme makul).
  if (filters.hasBookings === 'yes') {
    rows = rows.filter((r) => r.booking_count > 0);
  } else if (filters.hasBookings === 'no') {
    rows = rows.filter((r) => r.booking_count === 0);
  }

  return rows.map((r) => ({
    ...toDto(r),
    bookingCount: r.booking_count,
    approvedBookingCount: r.approved_count,
    pendingBookingCount: r.pending_count,
    lastBookingAt: r.last_booking,
  }));
}

export function listDepartments(): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT department FROM users
       WHERE department IS NOT NULL AND TRIM(department) != ''
       ORDER BY department ASC`
    )
    .all() as Array<{ department: string }>;
  return rows.map((r) => r.department);
}

export function getUserByIdAdmin(id: string): UserProfileDto {
  const row = getDb()
    .prepare(`SELECT ${PROFILE_COLUMNS} FROM users WHERE id = ? LIMIT 1`)
    .get(id) as UserRow | undefined;
  if (!row) throw new HttpError(404, 'Kullanıcı bulunamadı.', 'USER_NOT_FOUND');
  return toDto(row);
}

/**
 * Admin tarafından kullanıcı güncelleme.
 * Status değiştirilebilir (aktif/devre dışı).
 */
export function adminUpdateUser(id: string, input: AdminUserUpdateInput): UserProfileDto {
  const db = getDb();

  const exists = db.prepare(`SELECT id FROM users WHERE id = ? LIMIT 1`).get(id);
  if (!exists) throw new HttpError(404, 'Kullanıcı bulunamadı.', 'USER_NOT_FOUND');

  const updates: string[] = [];
  const params: unknown[] = [];

  const fieldMap: Array<[keyof AdminUserUpdateInput, string]> = [
    ['fullName', 'full_name'],
    ['department', 'department'],
    ['title', 'title'],
    ['manager', 'manager'],
    ['phone', 'phone'],
    ['bio', 'bio'],
    ['projectIdea', 'project_idea'],
    ['status', 'status'],
  ];

  for (const [k, col] of fieldMap) {
    if (input[k] !== undefined) {
      updates.push(`${col} = ?`);
      params.push(input[k] ?? null);
    }
  }

  if (updates.length === 0) {
    return getUserByIdAdmin(id);
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  params.push(id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getUserByIdAdmin(id);
}

/**
 * Soft delete — status=3.
 * Hard delete kullanılmaz çünkü bookings tablosunda RESTRICT FK var.
 * data_security §11: soft delete master data için tercih edilir.
 */
export function adminDeleteUser(id: string): { deleted: boolean } {
  const db = getDb();
  const txn = db.transaction(() => {
    const existing = db.prepare(`SELECT id, status FROM users WHERE id = ?`).get(id) as
      | { id: string; status: number }
      | undefined;
    if (!existing) throw new HttpError(404, 'Kullanıcı bulunamadı.', 'USER_NOT_FOUND');
    if (existing.status === 3) {
      throw new HttpError(409, 'Kullanıcı zaten devre dışı.', 'ALREADY_DELETED');
    }
    db.prepare(
      `UPDATE users SET status = 3, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(id);
    // Aktif refresh token'ları iptal et
    db.prepare(
      `UPDATE refresh_tokens SET revoked = 1 WHERE subject_id = ? AND subject_type = 'user'`
    ).run(id);
  });
  txn();
  return { deleted: true };
}

/**
 * Soft delete'i geri al (aktifleştir).
 */
export function adminRestoreUser(id: string): UserProfileDto {
  const db = getDb();
  const exists = db.prepare(`SELECT id, status FROM users WHERE id = ?`).get(id) as
    | { id: string; status: number }
    | undefined;
  if (!exists) throw new HttpError(404, 'Kullanıcı bulunamadı.', 'USER_NOT_FOUND');
  if (exists.status === 1) return getUserByIdAdmin(id);
  db.prepare(
    `UPDATE users SET status = 1, failed_login_count = 0, locked_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(id);
  return getUserByIdAdmin(id);
}
