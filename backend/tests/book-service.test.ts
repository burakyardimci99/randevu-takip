/**
 * Kütüphane (book) servisi — envanter CRUD + ödünç/iade + overdue testleri.
 *
 * Kapsam:
 *  - createBook: available = total; listAvailableBooks yalnız aktif kitap.
 *  - borrowBook: kopya azalır, aktif loan; çift ödünç + tükenmiş kopya reddi.
 *  - returnBook: kopya geri kazanılır; IDOR + çift iade reddi.
 *  - markOverdueLoans: süresi geçmiş aktif loan -> overdue.
 *  - deleteBook: aktif loan varken silinemez; updateBook total -> available kaydırma.
 */
import './setup-env';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { initSchema, closeDb, dbRun } from '../src/db/schema';
import {
  createBook,
  updateBook,
  deleteBook,
  getBookByIdAdmin,
  listAvailableBooks,
  listMyLoans,
  borrowBook,
  returnBook,
  markOverdueLoans,
  listAllLoans,
} from '../src/services/book.service';

const ADMIN = nanoid();
const USER1 = nanoid();
const USER2 = nanoid();

async function makeUser(id: string): Promise<void> {
  const hash = await argon2.hash('Demo1234!Pass', { type: argon2.argon2id });
  await dbRun(
    `INSERT OR IGNORE INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`,
    [id, `book-${nanoid(6)}@test.local`, hash, 'Book Tester']
  );
}

beforeAll(async () => {
  await initSchema();
  await makeUser(USER1);
  await makeUser(USER2);
});

afterAll(async () => {
  await closeDb();
});

describe('book.service — envanter', () => {
  it('createBook: available = total ve aktif', async () => {
    const book = await createBook(ADMIN, { title: 'TS Elkitabı', author: 'A. Yazar', totalCopies: 3 });
    expect(book.availableCopies).toBe(3);
    expect(book.totalCopies).toBe(3);
    expect(book.isActive).toBe(true);
  });

  it('listAvailableBooks: pasif kitabı göstermez', async () => {
    const passive = await createBook(ADMIN, { title: 'Pasif Kitap', author: 'X', totalCopies: 1 });
    await updateBook(ADMIN, passive.id, { isActive: false });
    const books = await listAvailableBooks(USER1);
    expect(books.find((b) => b.id === passive.id)).toBeUndefined();
  });

  it('updateBook: totalCopies artışı available_copies\'i delta kadar kaydırır', async () => {
    const book = await createBook(ADMIN, { title: 'Genişleyen', author: 'Y', totalCopies: 2 });
    const updated = await updateBook(ADMIN, book.id, { totalCopies: 5 });
    expect(updated.totalCopies).toBe(5);
    expect(updated.availableCopies).toBe(5); // 2 -> 5 (+3 delta, hiç ödünç yok)
  });
});

describe('book.service — ödünç / iade', () => {
  it('borrowBook: kopya azalır, aktif loan oluşur, borrowedByMe set olur', async () => {
    const book = await createBook(ADMIN, { title: 'Ödünç Kitap', author: 'Z', totalCopies: 2 });
    const loan = await borrowBook(USER1, book.id, 14);
    expect(loan.status).toBe('active');
    expect(loan.bookId).toBe(book.id);

    const after = await getBookByIdAdmin(book.id);
    expect(after?.availableCopies).toBe(1);

    const visible = await listAvailableBooks(USER1);
    expect(visible.find((b) => b.id === book.id)?.borrowedByMe).toBe(true);

    const mine = await listMyLoans(USER1);
    expect(mine.find((l) => l.id === loan.id)?.status).toBe('active');
  });

  it('borrowBook: aynı kullanıcı aynı kitabı iki kez ödünç alamaz', async () => {
    const book = await createBook(ADMIN, { title: 'Tek Ödünç', author: 'Z', totalCopies: 2 });
    await borrowBook(USER1, book.id, 14);
    await expect(borrowBook(USER1, book.id, 14)).rejects.toMatchObject({ code: 'ALREADY_BORROWED' });
  });

  it('borrowBook: müsait kopya yoksa reddeder', async () => {
    const book = await createBook(ADMIN, { title: 'Son Kopya', author: 'Z', totalCopies: 1 });
    await borrowBook(USER1, book.id, 14); // available 1 -> 0
    await expect(borrowBook(USER2, book.id, 14)).rejects.toMatchObject({ code: 'BOOK_UNAVAILABLE' });
  });

  it('returnBook: kopyayı geri kazandırır, durum returned olur', async () => {
    const book = await createBook(ADMIN, { title: 'İade Kitap', author: 'Z', totalCopies: 1 });
    const loan = await borrowBook(USER1, book.id, 14);
    expect((await getBookByIdAdmin(book.id))?.availableCopies).toBe(0);

    const returned = await returnBook(USER1, loan.id);
    expect(returned.status).toBe('returned');
    expect(returned.returnedAt).not.toBeNull();
    expect((await getBookByIdAdmin(book.id))?.availableCopies).toBe(1);
  });

  it('returnBook: başkasının ödüncü iade edilemez (IDOR)', async () => {
    const book = await createBook(ADMIN, { title: 'IDOR Kitap', author: 'Z', totalCopies: 1 });
    const loan = await borrowBook(USER1, book.id, 14);
    await expect(returnBook(USER2, loan.id)).rejects.toMatchObject({ code: 'LOAN_NOT_FOUND' });
  });

  it('returnBook: çift iade reddedilir', async () => {
    const book = await createBook(ADMIN, { title: 'Çift İade', author: 'Z', totalCopies: 1 });
    const loan = await borrowBook(USER1, book.id, 14);
    await returnBook(USER1, loan.id);
    await expect(returnBook(USER1, loan.id)).rejects.toMatchObject({ code: 'ALREADY_RETURNED' });
  });
});

describe('book.service — bakım & silme', () => {
  it('markOverdueLoans: süresi geçmiş aktif loan overdue olur', async () => {
    const book = await createBook(ADMIN, { title: 'Gecikmiş', author: 'Z', totalCopies: 1 });
    const loan = await borrowBook(USER1, book.id, 14);
    // due_at'i geçmişe çek.
    await dbRun(`UPDATE book_loans SET due_at = ? WHERE id = ?`, [
      new Date(Date.now() - 86400000).toISOString(),
      loan.id,
    ]);
    const n = await markOverdueLoans();
    expect(n).toBeGreaterThanOrEqual(1);
    const mine = await listMyLoans(USER1);
    expect(mine.find((l) => l.id === loan.id)?.status).toBe('overdue');
  });

  it('deleteBook: aktif ödünçlü kitap silinemez', async () => {
    const book = await createBook(ADMIN, { title: 'Silinemez', author: 'Z', totalCopies: 1 });
    await borrowBook(USER1, book.id, 14);
    await expect(deleteBook(ADMIN, book.id)).rejects.toMatchObject({ code: 'BOOK_HAS_ACTIVE_LOANS' });
  });

  it('deleteBook: ödüncü olmayan kitap silinir', async () => {
    const book = await createBook(ADMIN, { title: 'Silinebilir', author: 'Z', totalCopies: 1 });
    await deleteBook(ADMIN, book.id);
    expect(await getBookByIdAdmin(book.id)).toBeUndefined();
  });

  it('listAllLoans: admin tüm ödünçleri görür (status filtresi)', async () => {
    const active = await listAllLoans({ status: 'active' });
    expect(Array.isArray(active)).toBe(true);
    expect(active.every((l) => l.status === 'active')).toBe(true);
  });
});
