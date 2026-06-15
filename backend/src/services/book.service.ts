/**
 * Kütüphane servisi — kitap envanteri (admin) + ödünç alma/iade (kullanıcı).
 *
 * - Admin: kitap CRUD + tüm ödünç kayıtlarını görüntüleme.
 * - Kullanıcı: mevcut kitapları listeleme, belirli süreliğine ödünç alma, iade.
 * - Eşzamanlılık: available_copies güncellemeleri kitap-bazlı pg_advisory_xact_lock
 *   altında yapılır (aynı son kopyanın iki kullanıcıya verilmesi engellenir —
 *   booking.service lockRoomForBooking deseni).
 */
import { nanoid } from 'nanoid';
import type { Book, BookLoan } from '@klab/shared';
import { dbAll, dbOne, dbRun, dbTx } from '../db/schema';
import { HttpError } from '../middleware/error.middleware';
import { recordAudit } from './audit.service';
import type { CreateBookInput, UpdateBookInput } from '../validators/schemas';

const DEFAULT_LOAN_DAYS = 14;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface BookRow {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  category: string | null;
  description: string | null;
  cover_image_url: string | null;
  total_copies: number;
  available_copies: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  active_loan_count?: number | string;
  borrowed_by_me?: boolean;
}

interface LoanRow {
  id: string;
  book_id: string;
  user_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: string;
  created_at: string;
  user_full_name?: string;
  user_email?: string;
  book_title?: string;
  book_author?: string;
}

function rowToBook(r: BookRow): Book {
  return {
    id: r.id,
    title: r.title,
    author: r.author,
    isbn: r.isbn,
    category: r.category,
    description: r.description,
    coverImageUrl: r.cover_image_url,
    totalCopies: r.total_copies,
    availableCopies: r.available_copies,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...(r.active_loan_count !== undefined
      ? { activeLoanCount: Number(r.active_loan_count) }
      : {}),
    ...(r.borrowed_by_me !== undefined ? { borrowedByMe: !!r.borrowed_by_me } : {}),
  };
}

function rowToLoan(r: LoanRow): BookLoan {
  return {
    id: r.id,
    bookId: r.book_id,
    userId: r.user_id,
    ...(r.user_full_name !== undefined ? { userFullName: r.user_full_name } : {}),
    ...(r.user_email !== undefined ? { userEmail: r.user_email } : {}),
    bookTitle: r.book_title ?? '',
    bookAuthor: r.book_author ?? '',
    borrowedAt: r.borrowed_at,
    dueAt: r.due_at,
    returnedAt: r.returned_at,
    status: r.status as BookLoan['status'],
    createdAt: r.created_at,
  };
}

/* ============================================================
 * ADMIN — kitap envanteri yönetimi
 * ============================================================ */

export async function listAllBooks(): Promise<Book[]> {
  const rows = (await dbAll(
    `SELECT b.*,
            (SELECT COUNT(*) FROM book_loans l WHERE l.book_id = b.id AND l.status = 'active') AS active_loan_count
       FROM books b
       ORDER BY b.is_active DESC, b.title ASC`,
    []
  )) as BookRow[];
  return rows.map(rowToBook);
}

export async function getBookByIdAdmin(id: string): Promise<Book | undefined> {
  const row = (await dbOne(
    `SELECT b.*,
            (SELECT COUNT(*) FROM book_loans l WHERE l.book_id = b.id AND l.status = 'active') AS active_loan_count
       FROM books b WHERE b.id = ?`,
    [id]
  )) as BookRow | undefined;
  return row ? rowToBook(row) : undefined;
}

export async function createBook(adminId: string, input: CreateBookInput): Promise<Book> {
  const id = nanoid();
  await dbRun(
    `INSERT INTO books (id, title, author, isbn, category, description, cover_image_url, total_copies, available_copies, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      id,
      input.title,
      input.author,
      input.isbn ?? null,
      input.category ?? null,
      input.description ?? null,
      input.coverImageUrl ?? null,
      input.totalCopies,
      input.totalCopies,
    ]
  );
  recordAudit({
    eventType: 'book.created',
    subjectId: adminId,
    subjectType: 'admin',
    success: true,
    details: { bookId: id, title: input.title, totalCopies: input.totalCopies },
  });
  return (await getBookByIdAdmin(id)) as Book;
}

export async function updateBook(
  adminId: string,
  id: string,
  input: UpdateBookInput
): Promise<Book> {
  const existing = (await dbOne(
    `SELECT total_copies, available_copies FROM books WHERE id = ?`,
    [id]
  )) as { total_copies: number; available_copies: number } | undefined;
  if (!existing) throw new HttpError(404, 'Kitap bulunamadı.', 'BOOK_NOT_FOUND');

  // total_copies değişirse available_copies'i delta kadar kaydır (0..yeni toplam).
  let newTotal = existing.total_copies;
  let newAvailable = existing.available_copies;
  if (input.totalCopies !== undefined) {
    newTotal = input.totalCopies;
    const delta = newTotal - existing.total_copies;
    newAvailable = Math.max(0, Math.min(newTotal, existing.available_copies + delta));
  }

  await dbRun(
    `UPDATE books SET
       title = COALESCE(?, title),
       author = COALESCE(?, author),
       isbn = ?,
       category = ?,
       description = ?,
       cover_image_url = ?,
       total_copies = ?,
       available_copies = ?,
       is_active = COALESCE(?, is_active),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      input.title ?? null,
      input.author ?? null,
      input.isbn ?? null,
      input.category ?? null,
      input.description ?? null,
      input.coverImageUrl ?? null,
      newTotal,
      newAvailable,
      input.isActive === undefined ? null : input.isActive ? 1 : 0,
      id,
    ]
  );

  recordAudit({
    eventType: 'book.updated',
    subjectId: adminId,
    subjectType: 'admin',
    success: true,
    details: { bookId: id },
  });
  return (await getBookByIdAdmin(id)) as Book;
}

export async function deleteBook(adminId: string, id: string): Promise<void> {
  const book = (await dbOne(`SELECT id FROM books WHERE id = ?`, [id])) as { id: string } | undefined;
  if (!book) throw new HttpError(404, 'Kitap bulunamadı.', 'BOOK_NOT_FOUND');

  const active = (await dbOne(
    `SELECT COUNT(*) AS c FROM book_loans WHERE book_id = ? AND status = 'active'`,
    [id]
  )) as { c: number | string };
  if (Number(active.c) > 0) {
    throw new HttpError(
      409,
      'Aktif ödünçte kopyası olan kitap silinemez. Önce iadeler tamamlanmalı (veya kitabı pasife alın).',
      'BOOK_HAS_ACTIVE_LOANS'
    );
  }

  await dbRun(`DELETE FROM books WHERE id = ?`, [id]); // returned/overdue loanlar cascade ile silinir
  recordAudit({
    eventType: 'book.deleted',
    subjectId: adminId,
    subjectType: 'admin',
    success: true,
    details: { bookId: id },
  });
}

export async function listAllLoans(filters: { status?: BookLoan['status'] } = {}): Promise<BookLoan[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.status) {
    where.push('l.status = ?');
    params.push(filters.status);
  }
  const rows = (await dbAll(
    `SELECT l.*, b.title AS book_title, b.author AS book_author,
            u.full_name AS user_full_name, u.email AS user_email
       FROM book_loans l
       JOIN books b ON b.id = l.book_id
       JOIN users u ON u.id = l.user_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY l.borrowed_at DESC`,
    params
  )) as LoanRow[];
  return rows.map(rowToLoan);
}

/* ============================================================
 * KULLANICI — ödünç alma / iade
 * ============================================================ */

export async function listAvailableBooks(userId: string): Promise<Book[]> {
  const rows = (await dbAll(
    `SELECT b.*,
            EXISTS(
              SELECT 1 FROM book_loans l
              WHERE l.book_id = b.id AND l.user_id = ? AND l.status = 'active'
            ) AS borrowed_by_me
       FROM books b
       WHERE b.is_active = 1
       ORDER BY b.title ASC`,
    [userId]
  )) as BookRow[];
  return rows.map(rowToBook);
}

export async function listMyLoans(userId: string): Promise<BookLoan[]> {
  const rows = (await dbAll(
    `SELECT l.*, b.title AS book_title, b.author AS book_author
       FROM book_loans l
       JOIN books b ON b.id = l.book_id
       WHERE l.user_id = ?
       ORDER BY CASE WHEN l.status = 'returned' THEN 1 ELSE 0 END, l.due_at ASC`,
    [userId]
  )) as LoanRow[];
  return rows.map(rowToLoan);
}

async function getLoanForUser(userId: string, loanId: string): Promise<BookLoan | undefined> {
  const row = (await dbOne(
    `SELECT l.*, b.title AS book_title, b.author AS book_author
       FROM book_loans l JOIN books b ON b.id = l.book_id
       WHERE l.id = ? AND l.user_id = ?`,
    [loanId, userId]
  )) as LoanRow | undefined;
  return row ? rowToLoan(row) : undefined;
}

export async function borrowBook(
  userId: string,
  bookId: string,
  periodDays: number = DEFAULT_LOAN_DAYS
): Promise<BookLoan> {
  const loanId = await dbTx(async () => {
    // Kitap-bazlı kilit: available_copies yarışını ve son-kopya çift-ödüncünü kapatır.
    await dbRun('SELECT pg_advisory_xact_lock(hashtext(?))', [`book:${bookId}`]);

    const book = (await dbOne(
      `SELECT id, is_active, available_copies FROM books WHERE id = ?`,
      [bookId]
    )) as { id: string; is_active: number; available_copies: number } | undefined;
    if (!book) throw new HttpError(404, 'Kitap bulunamadı.', 'BOOK_NOT_FOUND');
    if (book.is_active !== 1) {
      throw new HttpError(409, 'Bu kitap şu an ödünç verilemiyor.', 'BOOK_INACTIVE');
    }
    if (book.available_copies <= 0) {
      throw new HttpError(409, 'Bu kitabın müsait kopyası yok.', 'BOOK_UNAVAILABLE');
    }

    const existing = (await dbOne(
      `SELECT id FROM book_loans WHERE book_id = ? AND user_id = ? AND status = 'active'`,
      [bookId, userId]
    )) as { id: string } | undefined;
    if (existing) {
      throw new HttpError(409, 'Bu kitap zaten sizde ödünçte.', 'ALREADY_BORROWED');
    }

    await dbRun(
      `UPDATE books SET available_copies = available_copies - 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [bookId]
    );

    const id = nanoid();
    const nowIso = new Date().toISOString();
    const dueIso = new Date(Date.now() + periodDays * ONE_DAY_MS).toISOString();
    await dbRun(
      `INSERT INTO book_loans (id, book_id, user_id, borrowed_at, due_at, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [id, bookId, userId, nowIso, dueIso]
    );
    return id;
  });

  recordAudit({
    eventType: 'book.borrowed',
    subjectId: userId,
    subjectType: 'user',
    success: true,
    details: { bookId, loanId, periodDays },
  });
  return (await getLoanForUser(userId, loanId)) as BookLoan;
}

export async function returnBook(userId: string, loanId: string): Promise<BookLoan> {
  const bookId = await dbTx(async () => {
    const loan = (await dbOne(
      `SELECT id, book_id, user_id, status FROM book_loans WHERE id = ?`,
      [loanId]
    )) as { id: string; book_id: string; user_id: string; status: string } | undefined;
    // IDOR: yalnız kendi ödüncünü iade edebilir (yoksa varlık ifşa etmeden 404).
    if (!loan || loan.user_id !== userId) {
      throw new HttpError(404, 'Ödünç kaydı bulunamadı.', 'LOAN_NOT_FOUND');
    }
    if (loan.status === 'returned') {
      throw new HttpError(409, 'Bu ödünç zaten iade edilmiş.', 'ALREADY_RETURNED');
    }

    await dbRun('SELECT pg_advisory_xact_lock(hashtext(?))', [`book:${loan.book_id}`]);

    // Koşullu güncelleme — eşzamanlı çift-iade ikinci çağrıda 0 satır etkiler.
    const res = await dbRun(
      `UPDATE book_loans SET status = 'returned', returned_at = ?
       WHERE id = ? AND status IN ('active', 'overdue')`,
      [new Date().toISOString(), loanId]
    );
    if (res.changes === 0) {
      throw new HttpError(409, 'Bu ödünç zaten iade edilmiş.', 'ALREADY_RETURNED');
    }

    // Kopyayı geri kazandır (toplamı aşmadan).
    await dbRun(
      `UPDATE books SET available_copies = LEAST(available_copies + 1, total_copies),
                        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [loan.book_id]
    );
    return loan.book_id;
  });

  recordAudit({
    eventType: 'book.returned',
    subjectId: userId,
    subjectType: 'user',
    success: true,
    details: { bookId, loanId },
  });
  return (await getLoanForUser(userId, loanId)) as BookLoan;
}

/* ============================================================
 * BAKIM — süresi geçmiş ödünçleri işaretle
 * ============================================================ */

/**
 * due_at geçmiş ve hâlâ 'active' ödünçleri 'overdue' işaretler. Periyodik bakım
 * cron'undan (leader-korumalı) çağrılır. Tek UPDATE — tx-güvenli. due_at ISO UTC →
 * leksik karşılaştırma güvenli. Güncellenen satır sayısını döner.
 */
export async function markOverdueLoans(): Promise<number> {
  const res = await dbRun(
    `UPDATE book_loans SET status = 'overdue' WHERE status = 'active' AND due_at < ?`,
    [new Date().toISOString()]
  );
  return res.changes;
}
