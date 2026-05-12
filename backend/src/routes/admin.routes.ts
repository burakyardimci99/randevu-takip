/**
 * Admin routes: tüm booking'leri görme + onay/red/feedback.
 * Path: /api/admin/*
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAdmin, requireAdminRole } from '../middleware/auth.middleware';
import {
  adminUserSearchSchema,
  adminUserUpdateSchema,
  mfaVerifySchema,
  reviewBookingSchema,
  similarSearchSchema,
} from '../validators/schemas';
import {
  getBookingByIdAdmin,
  listAllBookings,
  reviewBooking,
} from '../services/booking.service';
import { listRooms } from '../services/room.service';
import {
  adminDeleteUser,
  adminRestoreUser,
  adminUpdateUser,
  getUserByIdAdmin,
  listAllUsers,
  listDepartments,
} from '../services/user.service';
import { listAllWaitlist } from '../services/waitlist.service';
import { getAnalytics } from '../services/analytics.service';
import {
  backfillEmbeddings,
  bookingTextForEmbedding,
  currentModelId,
  findSimilarBookings,
  isMLAvailable,
} from '../services/embedding.service';
import {
  disableMfa,
  enrollMfa,
  getMfaStatus,
  verifyMfaCode,
} from '../services/mfa.service';
import { recordAudit } from '../services/audit.service';
import {
  distinctEventTypes,
  exportAuditCsv,
  listAuditLog,
} from '../services/audit-viewer.service';
import { listBackups, runBackupOnce } from '../services/backup.service';
import { HttpError } from '../middleware/error.middleware';
import { getDb } from '../db/schema';

const router = Router();

router.use(requireAdmin);
router.use(requireAdminRole('admin', 'super_admin'));

router.get('/rooms', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ rooms: listRooms() });
  } catch (err) {
    next(err);
  }
});

router.get('/bookings', (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as string | undefined;
    const allowed = ['pending', 'approved', 'rejected', 'feedback_requested'];
    const filter = status && allowed.includes(status)
      ? (status as 'pending' | 'approved' | 'rejected' | 'feedback_requested')
      : undefined;
    res.json({ bookings: listAllBookings({ status: filter }) });
  } catch (err) {
    next(err);
  }
});

router.get('/bookings/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
    }
    const booking = getBookingByIdAdmin(id);
    if (!booking) throw new HttpError(404, 'Booking bulunamadı.', 'NOT_FOUND');
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

router.post('/bookings/:id/review', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
    }
    const input = reviewBookingSchema.parse(req.body);
    const booking = reviewBooking(req.auth!.subjectId, id, input);

    recordAudit({
      eventType: 'booking.reviewed',
      subjectId: req.auth!.subjectId,
      subjectType: 'admin',
      ipAddress: req.ip,
      success: true,
      details: {
        bookingId: booking.id,
        action: input.action,
        newStatus: booking.status,
      },
    });

    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

/* ============ KULLANICI YÖNETİMİ ============ */

router.get('/users', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = adminUserSearchSchema.safeParse(req.query);
    const filters = parsed.success ? parsed.data : {};
    res.json({ users: listAllUsers(filters) });
  } catch (err) {
    next(err);
  }
});

router.get('/users/meta/departments', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ departments: listDepartments() });
  } catch (err) {
    next(err);
  }
});

router.get('/users/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz id.', 'INVALID_ID');
    }
    res.json({ user: getUserByIdAdmin(id) });
  } catch (err) {
    next(err);
  }
});

router.put('/users/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz id.', 'INVALID_ID');
    }
    const input = adminUserUpdateSchema.parse(req.body);
    const user = adminUpdateUser(id, input);

    recordAudit({
      eventType: 'user.update',
      subjectId: req.auth!.subjectId,
      subjectType: 'admin',
      ipAddress: req.ip,
      success: true,
      details: { targetUserId: id, fields: Object.keys(input) },
    });

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz id.', 'INVALID_ID');
    }
    adminDeleteUser(id);

    recordAudit({
      eventType: 'user.delete',
      subjectId: req.auth!.subjectId,
      subjectType: 'admin',
      ipAddress: req.ip,
      success: true,
      details: { targetUserId: id },
    });

    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

/**
 * KVKK — Admin tarafından user verisi ihracı.
 * Kullanım: kullanıcı manuel başvuru yapmış, admin onun adına çekiyor.
 */
router.get(
  '/users/:id/export',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz id.', 'INVALID_ID');
      }
      const { exportUserData } = await import('../services/privacy.service');
      const data = exportUserData(id);
      recordAudit({
        eventType: 'user.update',
        subjectId: req.auth!.subjectId,
        subjectType: 'admin',
        ipAddress: req.ip,
        success: true,
        details: { action: 'admin_data_export', targetUserId: id },
      });
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="klab-veri-${id}.json"`
      );
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(JSON.stringify(data, null, 2));
    } catch (err) {
      next(err);
    }
  }
);

/**
 * KVKK — Admin tarafından user verisi tamamen silme.
 * Body: { confirmation: 'KALICI SİL' }
 */
router.post(
  '/users/:id/purge',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz id.', 'INVALID_ID');
      }
      const confirmation = req.body?.confirmation;
      if (confirmation !== 'KALICI SİL') {
        throw new HttpError(
          400,
          "Onay metni eksik. Lütfen 'KALICI SİL' yazın.",
          'VALIDATION'
        );
      }
      const { purgeUser } = await import('../services/privacy.service');
      const result = purgeUser(id, { id: req.auth!.subjectId, type: 'admin' });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

router.post('/users/:id/restore', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz id.', 'INVALID_ID');
    }
    const user = adminRestoreUser(id);

    recordAudit({
      eventType: 'user.restore',
      subjectId: req.auth!.subjectId,
      subjectType: 'admin',
      ipAddress: req.ip,
      success: true,
      details: { targetUserId: id },
    });

    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.get('/stats', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const all = listAllBookings();
    const stats = {
      total: all.length,
      pending: all.filter((b) => b.status === 'pending').length,
      approved: all.filter((b) => b.status === 'approved').length,
      rejected: all.filter((b) => b.status === 'rejected').length,
      feedback_requested: all.filter((b) => b.status === 'feedback_requested').length,
    };
    res.json({ stats });
  } catch (err) {
    next(err);
  }
});

/* ============ AUDIT LOG VIEWER ============ */

router.get('/audit', (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query;
    const filters: Parameters<typeof listAuditLog>[0] = {
      eventType: typeof q.eventType === 'string' ? q.eventType : undefined,
      subjectType:
        q.subjectType === 'user' || q.subjectType === 'admin' || q.subjectType === 'anonymous'
          ? (q.subjectType as 'user' | 'admin' | 'anonymous')
          : undefined,
      subjectId: typeof q.subjectId === 'string' ? q.subjectId : undefined,
      success: q.success === 'true' ? true : q.success === 'false' ? false : undefined,
      ipAddress: typeof q.ipAddress === 'string' ? q.ipAddress : undefined,
      since: typeof q.since === 'string' ? q.since : undefined,
      until: typeof q.until === 'string' ? q.until : undefined,
      q: typeof q.q === 'string' ? q.q : undefined,
      limit: typeof q.limit === 'string' ? Math.min(parseInt(q.limit, 10) || 50, 500) : undefined,
      offset: typeof q.offset === 'string' ? Math.max(parseInt(q.offset, 10) || 0, 0) : undefined,
    };
    res.json(listAuditLog(filters));
  } catch (err) {
    next(err);
  }
});

router.get('/audit/event-types', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ eventTypes: distinctEventTypes() });
  } catch (err) {
    next(err);
  }
});

router.get('/audit/export', (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query;
    const csv = exportAuditCsv({
      eventType: typeof q.eventType === 'string' ? q.eventType : undefined,
      subjectType:
        q.subjectType === 'user' || q.subjectType === 'admin' || q.subjectType === 'anonymous'
          ? (q.subjectType as 'user' | 'admin' | 'anonymous')
          : undefined,
      since: typeof q.since === 'string' ? q.since : undefined,
      until: typeof q.until === 'string' ? q.until : undefined,
    });
    recordAudit({
      eventType: 'user.update',
      subjectId: req.auth!.subjectId,
      subjectType: 'admin',
      ipAddress: req.ip,
      success: true,
      details: { action: 'audit_csv_export' },
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="klab-audit-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

/* ============ DB BACKUP ============ */

router.get('/backup', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ backups: listBackups() });
  } catch (err) {
    next(err);
  }
});

router.post('/backup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await runBackupOnce();
    recordAudit({
      eventType: 'user.update',
      subjectId: req.auth!.subjectId,
      subjectType: 'admin',
      ipAddress: req.ip,
      success: true,
      details: { action: 'manual_backup', sizeBytes: result.sizeBytes },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/* ============ ANALYTICS ============ */

router.get('/analytics', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(getAnalytics());
  } catch (err) {
    next(err);
  }
});

/* ============ WAITLIST (admin görünüm) ============ */

router.get('/waitlist', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ entries: listAllWaitlist() });
  } catch (err) {
    next(err);
  }
});

/* ============ SEMANTIC SEARCH (admin tarafından bütün booking'lerde) ============ */

router.get('/embedding/status', (_req: Request, res: Response) => {
  res.json({ mlAvailable: isMLAvailable(), model: currentModelId() });
});

router.post('/embedding/backfill', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await backfillEmbeddings();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/similar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = similarSearchSchema.parse(req.body);
    let queryText = '';
    let excludeBookingId: string | undefined;

    if (input.bookingId) {
      const booking = getBookingByIdAdmin(input.bookingId);
      if (!booking) throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
      queryText = bookingTextForEmbedding({
        projectName: booking.projectName,
        projectDescription: booking.projectDescription,
        technologies: booking.technologies,
      });
      excludeBookingId = booking.id;
    } else {
      queryText = bookingTextForEmbedding({
        projectName: input.projectName ?? '',
        projectDescription: input.projectDescription ?? '',
        technologies: input.technologies ?? [],
      });
    }

    // Admin: full visibility
    const results = await findSimilarBookings({
      queryText,
      limit: input.limit ?? 8,
      excludeBookingId,
      minSimilarity: input.minSimilarity ?? 0.25,
      visibility: 'admin',
    });
    res.json({ results });
  } catch (err) {
    next(err);
  }
});

/* ============ ADMIN MFA ============ */

router.get('/mfa/status', (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(getMfaStatus(req.auth!.subjectId));
  } catch (err) {
    next(err);
  }
});

router.post('/mfa/enroll', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await enrollMfa(req.auth!.subjectId);
    recordAudit({
      eventType: 'auth.mfa.enroll',
      subjectId: req.auth!.subjectId,
      subjectType: 'admin',
      ipAddress: req.ip,
      success: true,
    });
    // QR + secret döner; verify sonrası enrollment tamamlanır
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/mfa/verify', (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = mfaVerifySchema.parse(req.body);
    const result = verifyMfaCode(req.auth!.subjectId, input.code);
    recordAudit({
      eventType: result.valid ? 'auth.mfa.verify.success' : 'auth.mfa.verify.failure',
      subjectId: req.auth!.subjectId,
      subjectType: 'admin',
      ipAddress: req.ip,
      success: result.valid,
      details: { usedBackupCode: result.usedBackupCode },
    });
    if (!result.valid) {
      throw new HttpError(401, 'MFA kodu geçersiz.', 'MFA_INVALID');
    }
    res.json({ verified: true, usedBackupCode: result.usedBackupCode });
  } catch (err) {
    next(err);
  }
});

router.post('/mfa/disable', (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = mfaVerifySchema.parse(req.body); // Disable için 1 doğru kod zorunlu
    const verify = verifyMfaCode(req.auth!.subjectId, input.code);
    if (!verify.valid) {
      throw new HttpError(401, 'MFA kodu geçersiz.', 'MFA_INVALID');
    }
    disableMfa(req.auth!.subjectId);
    recordAudit({
      eventType: 'auth.mfa.disabled',
      subjectId: req.auth!.subjectId,
      subjectType: 'admin',
      ipAddress: req.ip,
      success: true,
    });
    res.json({ disabled: true });
  } catch (err) {
    next(err);
  }
});

/* ============ SHOWCASE (admin etiketleme — highlight) ============ */

router.put(
  '/bookings/:id/showcase',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
      }
      const visible = typeof req.body?.visible === 'boolean' ? req.body.visible : undefined;
      const highlight =
        typeof req.body?.highlight === 'boolean' ? req.body.highlight : undefined;
      if (visible === undefined && highlight === undefined) {
        throw new HttpError(
          400,
          "'visible' veya 'highlight' alanlarından en az biri gönderilmeli.",
          'VALIDATION'
        );
      }
      const db = getDb();
      const sets: string[] = [];
      const params: unknown[] = [];
      if (visible !== undefined) {
        sets.push('showcase_visible = ?');
        params.push(visible ? 1 : 0);
      }
      if (highlight !== undefined) {
        sets.push('showcase_highlight = ?');
        params.push(highlight ? 1 : 0);
      }
      sets.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      db.prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE id = ?`).run(...params);
      const updated = getBookingByIdAdmin(id);
      res.json({ booking: updated });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
