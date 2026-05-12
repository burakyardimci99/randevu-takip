/**
 * Zod doğrulama şemaları.
 *
 * Güvenlik:
 * - app_security.md §3: Whitelist tabanlı server-side doğrulama (tip + uzunluk + format).
 * - app_security.md §4: Parola politikası: min 12 karakter, karmaşıklık zorunlu.
 */
import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5)
  .max(254)
  .email('Geçersiz e-posta adresi.');

export const passwordSchema = z
  .string()
  .min(12, 'Parola en az 12 karakter olmalı.')
  .max(128, 'Parola en fazla 128 karakter olabilir.')
  .refine((p) => /[A-Z]/.test(p), 'Parolada en az bir büyük harf olmalı.')
  .refine((p) => /[a-z]/.test(p), 'Parolada en az bir küçük harf olmalı.')
  .refine((p) => /[0-9]/.test(p), 'Parolada en az bir rakam olmalı.')
  .refine(
    (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p),
    'Parolada en az bir özel karakter olmalı.'
  );

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

/**
 * Kullanıcı kayıt şeması.
 * - Parola politikası uygulanır (min 12 + karmaşıklık)
 * - Ad-soyad whitelist tabanlı (sadece harfler, boşluk, kısa çizgi)
 */
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  passwordConfirm: z.string().min(1).max(128),
  fullName: z
    .string()
    .trim()
    .min(3, 'Ad-soyad en az 3 karakter olmalı.')
    .max(80, 'Ad-soyad en fazla 80 karakter olabilir.')
    .regex(
      /^[A-Za-zÇĞİıÖŞÜçğıöşü' -]+$/,
      'Ad-soyad yalnızca harf, boşluk ve tire içerebilir.'
    ),
}).refine((d) => d.password === d.passwordConfirm, {
  message: 'Parolalar eşleşmiyor.',
  path: ['passwordConfirm'],
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Profile update — kullanıcının kendi profilini güncelleyebileceği alanlar.
 * E-posta ve parola buradan güncellenmez (ayrı endpoint'ler).
 */
const optionalShortText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));

export const profileUpdateSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, 'Ad-soyad en az 3 karakter olmalı.')
    .max(80)
    .regex(/^[A-Za-zÇĞİıÖŞÜçğıöşü' -]+$/, 'Ad-soyad yalnızca harf içerebilir.')
    .optional(),
  department: optionalShortText(80),
  title: optionalShortText(80),
  manager: optionalShortText(80),
  phone: z
    .string()
    .trim()
    .regex(/^[\d+\-() ]*$/, 'Telefon yalnızca rakam ve +-() içerebilir.')
    .max(24)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  bio: optionalShortText(500),
  projectIdea: optionalShortText(1000),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/**
 * Admin tarafından user düzenleme.
 * Admin daha geniş alanları değiştirebilir; role/email/parola değiştirme bu endpoint'te yok.
 * status: 1 (aktif), 3 (devre dışı/soft deleted)
 */
export const adminUserUpdateSchema = profileUpdateSchema.extend({
  status: z.union([z.literal(1), z.literal(3)]).optional(),
});

export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

const safeText = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} en az ${min} karakter olmalı.`)
    .max(max, `${label} en fazla ${max} karakter olabilir.`);

export const createBookingSchema = z.object({
  roomId: z.string().min(8).max(40),
  periodMonths: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih formatı YYYY-MM-DD olmalı.'),
  projectName: safeText(3, 120, 'Proje adı'),
  projectDescription: safeText(20, 2000, 'Proje açıklaması'),
  helpNeeded: safeText(10, 2000, 'Yardım talebi'),
  technologies: z
    .array(z.string().trim().min(1).max(40))
    .min(1, 'En az bir teknoloji seçin.')
    .max(20, 'En fazla 20 teknoloji seçilebilir.'),
});

export const reviewBookingSchema = z
  .object({
    action: z.enum(['approve', 'reject', 'request_feedback']),
    feedback: z.string().trim().max(2000).optional(),
  })
  .refine(
    (v) => (v.action === 'request_feedback' ? !!v.feedback && v.feedback.length >= 10 : true),
    {
      message: "'request_feedback' seçildiğinde en az 10 karakterlik feedback zorunludur.",
      path: ['feedback'],
    }
  );

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ReviewBookingInput = z.infer<typeof reviewBookingSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

/* ============================================================
 * Waitlist
 * ============================================================ */

export const joinWaitlistSchema = z.object({
  roomId: z.string().min(8).max(40),
  periodMonths: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  desiredStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih formatı YYYY-MM-DD olmalı.'),
  projectName: safeText(3, 120, 'Proje adı'),
  projectDescription: safeText(20, 2000, 'Proje açıklaması'),
  helpNeeded: safeText(10, 2000, 'Yardım talebi'),
  technologies: z
    .array(z.string().trim().min(1).max(40))
    .min(1, 'En az bir teknoloji seçin.')
    .max(20, 'En fazla 20 teknoloji seçilebilir.'),
});

export type JoinWaitlistInput = z.infer<typeof joinWaitlistSchema>;

/* ============================================================
 * Semantic search
 * ============================================================ */

export const similarSearchSchema = z.object({
  // Önceden oluşturulmuş booking'in benzerlerini getirmek için
  bookingId: z.string().min(8).max(40).optional(),
  // Veya serbest metin (yeni booking formu önizleme)
  projectName: z.string().trim().min(3).max(120).optional(),
  projectDescription: z.string().trim().min(10).max(2000).optional(),
  technologies: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
}).refine(
  (v) =>
    !!v.bookingId ||
    (!!v.projectName && !!v.projectDescription) ||
    (!!v.projectDescription && !!v.technologies && v.technologies.length > 0),
  {
    message:
      "Ya `bookingId` ya da en az `projectName`+`projectDescription` ya da `projectDescription`+`technologies` gönderilmeli.",
    path: ['bookingId'],
  }
);

export type SimilarSearchInput = z.infer<typeof similarSearchSchema>;

/* ============================================================
 * Admin user search
 * ============================================================ */

export const adminUserSearchSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.union([z.literal('all'), z.literal('active'), z.literal('disabled')]).optional(),
  department: z.string().trim().max(80).optional(),
  hasBookings: z.union([z.literal('any'), z.literal('yes'), z.literal('no')]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type AdminUserSearchInput = z.infer<typeof adminUserSearchSchema>;

/* ============================================================
 * Admin MFA
 * ============================================================ */

export const mfaVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, '6 haneli kod giriniz.'),
});

export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
