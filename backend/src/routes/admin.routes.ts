/**
 * Admin routes: tüm booking'leri görme + onay/red/feedback.
 * Path: /api/admin/*
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  requireAdmin,
  requireAdminRole,
  requireGovernanceRole,
  requireStaff,
} from '../middleware/auth.middleware';
import {
  adminLicenseRequestsFilterSchema,
  adminResetUserPasswordSchema,
  adminUserSearchSchema,
  adminUserUpdateSchema,
  advanceLifecycleSchema,
  assignEngineerSchema,
  changeAdminPasswordSchema,
  decideApprovalSchema,
  gateResultSchema,
  hardwareRequestsFilterSchema,
  mfaVerifySchema,
  reassignRoomSchema,
  reassignUserSchema,
  rejectStageAdvanceSchema,
  reviewBookingSchema,
  reviewHardwareRequestSchema,
  reviewLicenseRequestSchema,
  setReviewTrackSchema,
  similarSearchSchema,
  supportRequestsFilterSchema,
  waitlistMoveSchema,
} from '../validators/schemas';
import {
  getBookingByIdAdmin,
  listAllBookings,
  reassignBookingRoom,
  reassignBookingUser,
  adminDeleteBooking,
  reviewBooking,
  advanceBookingLifecycle,
  regressBookingLifecycle,
  setBookingReviewTrack,
  rejectStageAdvanceRequest,
} from '../services/booking.service';
import {
  cancelAppointment as adminCancelAppointment,
  listAllAppointments,
  listBookingAppointments,
} from '../services/appointment.service';
import { listRooms, getRoomsWithOccupancy } from '../services/room.service';
import {
  adminDeleteUser,
  adminResetUserPassword,
  adminRestoreUser,
  adminUpdateUser,
  getUserByIdAdmin,
  listAllUsers,
  listDepartments,
} from '../services/user.service';
import { changeAdminPassword } from '../services/auth.service';
import { listAllWaitlist, moveWaitlistEntry } from '../services/waitlist.service';
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
import { getLicenseReport, LICENSE_CATALOG } from '../services/license.service';
import {
  listAdminHardwareRequests,
  reviewHardwareRequest,
} from '../services/hardware-request.service';
import {
  listAdminSupportRequests,
  resolveSupportRequest,
} from '../services/support-request.service';
import { listBackups, runBackupOnce } from '../services/backup.service';
import { csrfProtection } from '../middleware/cookie-auth';
import { HttpError } from '../middleware/error.middleware';
import { getDb } from '../db/schema';

const router = Router();

// Erişim politikası:
//  - GET (read-only) → requireStaff: admin + Analitik Danışman + YZ/Ar-Ge.
//    Governance rolleri admin panel sayfalarını (oda, takvim, proje, kullanıcı,
//    lisans) görüntüleyebilir ama değiştiremez.
//  - Mutasyonlar (POST/PUT/PATCH/DELETE) → requireAdmin + admin rol kontrolü.
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET') {
    requireStaff(req, res, next);
    return;
  }
  requireAdmin(req, res, next);
});
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET') {
    next(); // GET zaten requireStaff'tan geçti — admin rol kontrolü atlanır
    return;
  }
  requireAdminRole('admin', 'super_admin')(req, res, next);
});

// CSRF — tüm admin state-changing endpoint'leri korur (booking review,
// user update/restore/purge, MFA, license review, backup, vb.).
// GET'ler csrf-csrf `ignoredMethods` ile muaf.
router.use(csrfProtection);

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

router.get('/bookings/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
    }
    const booking = getBookingByIdAdmin(id);
    if (!booking) throw new HttpError(404, 'Booking bulunamadı.', 'NOT_FOUND');
    // Yaşam döngüsü zaman çizelgesi — modal "Geçmiş" tab'ında gösterilir.
    const { listStageEvents } = await import('../services/governance.service');
    res.json({ booking, stageEvents: listStageEvents(id) });
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
    const result = reviewBooking(req.auth!.subjectId, id, input);

    recordAudit({
      eventType: 'booking.reviewed',
      subjectId: req.auth!.subjectId,
      subjectType: 'admin',
      ipAddress: req.ip,
      success: true,
      details: {
        bookingId: result.booking.id,
        action: input.action,
        newStatus: result.booking.status,
        autoWaitlisted: result.autoWaitlisted ?? false,
      },
    });

    res.json({
      booking: result.booking,
      autoWaitlisted: result.autoWaitlisted ?? false,
      waitlistPosition: result.waitlistPosition,
    });
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

/** Admin: bir kullanıcının parolasını sıfırlar. */
router.post(
  '/users/:id/reset-password',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz id.', 'INVALID_ID');
      }
      const { password } = adminResetUserPasswordSchema.parse(req.body);
      await adminResetUserPassword(id, password);
      recordAudit({
        eventType: 'admin.password_reset',
        subjectId: req.auth!.subjectId,
        subjectType: 'admin',
        ipAddress: req.ip,
        success: true,
        details: { targetUserId: id },
      });
      res.json({ message: 'Kullanıcının parolası sıfırlandı.' });
    } catch (err) {
      next(err);
    }
  }
);

/** Admin kendi parolasını değiştirir. */
router.post(
  '/auth/change-password',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = changeAdminPasswordSchema.parse(req.body);
      await changeAdminPassword(
        req.auth!.subjectId,
        input.currentPassword,
        input.newPassword
      );
      recordAudit({
        eventType: 'admin.password_changed',
        subjectId: req.auth!.subjectId,
        subjectType: 'admin',
        ipAddress: req.ip,
        success: true,
      });
      res.json({ message: 'Parolan güncellendi.' });
    } catch (err) {
      next(err);
    }
  }
);

/* ============ ODALAR — doluluk + atama ============ */

/** Admin "Odalar" görünümü — her oda + içindeki kullanıcılar. */
router.get('/rooms/occupancy', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ rooms: getRoomsWithOccupancy() });
  } catch (err) {
    next(err);
  }
});

/** Admin: bir booking'i başka odaya taşır. */
router.post('/bookings/:id/reassign', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
    }
    const { roomId } = reassignRoomSchema.parse(req.body);
    const booking = reassignBookingRoom(req.auth!.subjectId, id, roomId);
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

/** Admin: bir booking'in kullanıcısını değiştirir (oda kullanıcısını "değiştir"). */
router.post(
  '/bookings/:id/reassign-user',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
      }
      const { userId } = reassignUserSchema.parse(req.body);
      const booking = reassignBookingUser(req.auth!.subjectId, id, userId);
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

/** Admin: bir booking'i tamamen siler (oda kullanıcısını "çıkar"). */
router.delete('/bookings/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
    }
    const result = adminDeleteBooking(req.auth!.subjectId, id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Admin: bir booking'i yaşam döngüsünde bir sonraki aşamaya ilerlet. */
router.post(
  '/bookings/:id/advance-stage',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
      }
      const booking = advanceBookingLifecycle(req.auth!.subjectId, id);
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

/** Admin: bir booking'i yaşam döngüsünde bir önceki aşamaya geri al. */
router.post(
  '/bookings/:id/regress-stage',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
      }
      const booking = regressBookingLifecycle(req.auth!.subjectId, id);
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

/** Admin: SWAT (fast-track) inceleme akışına al/çıkar. */
router.post(
  '/bookings/:id/review-track',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
      }
      const { track } = setReviewTrackSchema.parse(req.body);
      const booking = setBookingReviewTrack(req.auth!.subjectId, id, track);
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

/** Admin: kullanıcının aşama ilerletme talebini reddet (ilerletmeden iptal). */
router.delete(
  '/bookings/:id/advance-request',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
      }
      // Body opsiyonel — DELETE üzerinde JSON body olabilir/olmayabilir.
      const note = rejectStageAdvanceSchema.parse(req.body ?? {}).note;
      const booking = rejectStageAdvanceRequest(req.auth!.subjectId, id, note);
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

/* ============ APPOINTMENTS (admin) ============ */

/** Admin: tüm randevuları listele (yönetim takvimi). */
router.get('/appointments', (req: Request, res: Response, next: NextFunction) => {
  try {
    const fromRaw = req.query.from;
    const toRaw = req.query.to;
    const includeCancelled = req.query.includeCancelled === 'true';
    const appointments = listAllAppointments({
      from: typeof fromRaw === 'string' ? fromRaw : undefined,
      to: typeof toRaw === 'string' ? toRaw : undefined,
      includeCancelled,
    });
    res.json({ appointments });
  } catch (err) {
    next(err);
  }
});

/** Admin: bir booking'in randevuları. */
router.get(
  '/bookings/:id/appointments',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
      }
      const appointments = listBookingAppointments(id, { includeCancelled: true });
      res.json({ appointments });
    } catch (err) {
      next(err);
    }
  }
);

/** Admin: bir randevuyu iptal et. */
router.delete(
  '/appointments/:id',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz randevu id.', 'INVALID_ID');
      }
      const result = adminCancelAppointment(req.auth!.subjectId, id, {
        ownerCheck: false,
        callerType: 'admin',
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

/** Admin: waitlist sırası değiştirme (öncelik verme). */
router.post('/waitlist/:id/move', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz waitlist id.', 'INVALID_ID');
    }
    const { move } = waitlistMoveSchema.parse(req.body);
    moveWaitlistEntry(id, move);
    res.json({ entries: listAllWaitlist() });
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

/* ============ LİSANSLAR ============ */

router.get('/licenses', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(getLicenseReport());
  } catch (err) {
    next(err);
  }
});

router.get('/licenses/catalog', (_req: Request, res: Response, next: NextFunction) => {
  try {
    // UI tarafında "tanınan teknolojiler" gösterimi için
    const list = Object.entries(LICENSE_CATALOG).map(([key, info]) => ({
      key,
      ...info,
    }));
    res.json({ catalog: list });
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

/* ============================================================
 * LİSANSLAR — admin talep review
 * ============================================================ */

router.get(
  '/licenses/requests',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = adminLicenseRequestsFilterSchema.parse(req.query);
      const { listAdminLicenseRequests } = await import('../services/license-request.service');
      const items = listAdminLicenseRequests(status);
      res.json({ items });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/licenses/budget',
  requireAdmin,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { getLicenseBudgetReport } = await import('../services/license-request.service');
      res.json(getLicenseBudgetReport());
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/licenses/requests/:id/review',
  requireAdmin,
  requireAdminRole('admin', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz talep id.', 'INVALID_ID');
      }
      const input = reviewLicenseRequestSchema.parse(req.body);
      const { reviewLicenseRequest } = await import('../services/license-request.service');
      const updated = reviewLicenseRequest(req.auth!.subjectId, id, input);
      recordAudit({
        eventType: 'license_request.reviewed',
        subjectId: req.auth!.subjectId,
        subjectType: 'admin',
        ipAddress: req.ip,
        success: true,
        details: { requestId: updated.id, action: input.action, status: updated.status },
      });
      res.json({ request: updated });
    } catch (err) {
      next(err);
    }
  }
);

/* ============================================================
 * YÖNETİŞİM — yaşam döngüsü, kalite kapıları, onaylar
 * ============================================================ */

/** id parametresini doğrular. */
function readRequestId(req: Request): string {
  const raw = req.params.id;
  const id = typeof raw === 'string' ? raw : '';
  if (!id || id.length < 8 || id.length > 40) {
    throw new HttpError(400, 'Geçersiz talep id.', 'INVALID_ID');
  }
  return id;
}

/** Başvuru/proje detayı — yönetişim demeti dahil. */
router.get(
  '/licenses/requests/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = readRequestId(req);
      const { getAdminLicenseRequestById } = await import(
        '../services/license-request.service'
      );
      const request = getAdminLicenseRequestById(id);
      if (!request) {
        throw new HttpError(404, 'Talep bulunamadı.', 'LICENSE_REQUEST_NOT_FOUND');
      }
      const { listGatesForRequest } = await import('../services/quality-gate.service');
      const { listApprovalsForRequest } = await import('../services/human-approval.service');
      const { listStageEvents } = await import('../services/governance.service');
      res.json({
        request,
        gates: listGatesForRequest(id),
        approvals: listApprovalsForRequest(id),
        stageEvents: listStageEvents(id),
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Yönetişim dashboard metrikleri. */
router.get(
  '/licenses/governance/dashboard',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { getGovernanceDashboard } = await import('../services/governance.service');
      res.json(getGovernanceDashboard());
    } catch (err) {
      next(err);
    }
  }
);

/** Lab Mühendisi atama için admin listesi. */
router.get(
  '/governance/admins',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = getDb()
        .prepare(
          `SELECT id, full_name, role, governance_role
           FROM admins WHERE status = 1 ORDER BY full_name`
        )
        .all() as Array<{
        id: string;
        full_name: string;
        role: string;
        governance_role: string | null;
      }>;
      res.json({
        admins: rows.map((r) => ({
          id: r.id,
          fullName: r.full_name,
          role: r.role,
          governanceRole: r.governance_role,
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Projeyi bir sonraki yaşam döngüsü aşamasına ilerlet. */
router.post(
  '/licenses/requests/:id/advance',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = readRequestId(req);
      const input = advanceLifecycleSchema.parse(req.body);
      const { advanceLifecycle } = await import('../services/governance.service');
      const { getAdminLicenseRequestById } = await import(
        '../services/license-request.service'
      );
      const result = advanceLifecycle(id, req.auth!.subjectId, input.note);
      const request = getAdminLicenseRequestById(id)!;

      recordAudit({
        eventType: 'license_request.updated',
        subjectId: req.auth!.subjectId,
        subjectType: 'admin',
        ipAddress: req.ip,
        success: true,
        details: { requestId: id, action: 'advance', from: result.fromStage, to: result.toStage },
      });

      const { pushNotification } = await import('../services/notification-center.service');
      const { STAGE_LABEL } = await import('../services/governance-data');
      pushNotification({
        recipientId: request.userId,
        recipientType: 'user',
        category: 'license',
        title: `Projen ${STAGE_LABEL[result.toStage]} aşamasına geçti`,
        body: `"${request.requestTitle ?? request.licenseName}" — yaşam döngüsü ilerledi.`,
        link: '/licenses',
      });

      res.json({ request, transition: result });
    } catch (err) {
      next(err);
    }
  }
);

/** Lab Mühendisi ata. */
router.post(
  '/licenses/requests/:id/assign-engineer',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = readRequestId(req);
      const input = assignEngineerSchema.parse(req.body);
      const { assignEngineer } = await import('../services/governance.service');
      const { getAdminLicenseRequestById } = await import(
        '../services/license-request.service'
      );
      assignEngineer(id, input.engineerId);
      recordAudit({
        eventType: 'license_request.updated',
        subjectId: req.auth!.subjectId,
        subjectType: 'admin',
        ipAddress: req.ip,
        success: true,
        details: { requestId: id, action: 'assign_engineer', engineerId: input.engineerId },
      });
      res.json({ request: getAdminLicenseRequestById(id) });
    } catch (err) {
      next(err);
    }
  }
);

/** Proje türünü Kuruma Entegre'ye yükselt. */
router.post(
  '/licenses/requests/:id/upgrade-type',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = readRequestId(req);
      const { upgradeProjectType } = await import('../services/governance.service');
      const { getAdminLicenseRequestById } = await import(
        '../services/license-request.service'
      );
      upgradeProjectType(id, req.auth!.subjectId);
      recordAudit({
        eventType: 'license_request.updated',
        subjectId: req.auth!.subjectId,
        subjectType: 'admin',
        ipAddress: req.ip,
        success: true,
        details: { requestId: id, action: 'upgrade_type' },
      });
      res.json({ request: getAdminLicenseRequestById(id) });
    } catch (err) {
      next(err);
    }
  }
);

/** Kalite kapısı sonucunu kaydet/güncelle. */
router.put(
  '/licenses/requests/:id/gates',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = readRequestId(req);
      const input = gateResultSchema.parse(req.body);
      const { setGateResult } = await import('../services/quality-gate.service');
      const gate = setGateResult(id, input.gateKey, {
        status: input.status,
        score: input.score ?? null,
        detail: input.detail ?? null,
      });
      recordAudit({
        eventType: 'license_request.updated',
        subjectId: req.auth!.subjectId,
        subjectType: 'admin',
        ipAddress: req.ip,
        success: true,
        details: { requestId: id, action: 'gate_result', gate: input.gateKey, status: input.status },
      });
      res.json({ gate });
    } catch (err) {
      next(err);
    }
  }
);

/** Stage / Production insan onayı kararı — YZ/Ar-Ge Mühendisi yetkisi. */
router.post(
  '/licenses/requests/:id/approval',
  requireGovernanceRole('yz_arge'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = readRequestId(req);
      const input = decideApprovalSchema.parse(req.body);
      const { decideApproval } = await import('../services/human-approval.service');
      const { getAdminLicenseRequestById } = await import(
        '../services/license-request.service'
      );
      const approval = decideApproval(id, input.approvalType, req.auth!.subjectId, {
        decision: input.decision,
        releaseNote: input.releaseNote,
        riskAssessment: input.riskAssessment,
      });
      const request = getAdminLicenseRequestById(id)!;

      recordAudit({
        eventType: 'license_request.reviewed',
        subjectId: req.auth!.subjectId,
        subjectType: 'admin',
        ipAddress: req.ip,
        success: true,
        details: {
          requestId: id,
          action: 'approval',
          approvalType: input.approvalType,
          decision: input.decision,
        },
      });

      const { pushNotification } = await import('../services/notification-center.service');
      const typeLabel = input.approvalType === 'stage' ? 'Stage' : 'Production';
      pushNotification({
        recipientId: request.userId,
        recipientType: 'user',
        category: 'license',
        title: `${typeLabel} onayı ${input.decision === 'approved' ? 'verildi' : 'reddedildi'}`,
        body: `"${request.requestTitle ?? request.licenseName}" — ${typeLabel} insan onay noktası.`,
        link: '/licenses',
      });

      res.json({ request, approval });
    } catch (err) {
      next(err);
    }
  }
);

/* ============================================================
 * BİLDİRİM MERKEZİ — admin
 * ============================================================ */

router.get(
  '/notifications',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { listNotifications, countUnreadNotifications } = await import(
        '../services/notification-center.service'
      );
      const aid = req.auth!.subjectId;
      res.json({
        items: listNotifications(aid, 'admin'),
        unread: countUnreadNotifications(aid, 'admin'),
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/notifications/:id/read',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz bildirim id.', 'INVALID_ID');
      }
      const { markNotificationRead } = await import(
        '../services/notification-center.service'
      );
      markNotificationRead(req.auth!.subjectId, 'admin', id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/notifications/read-all',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { markAllNotificationsRead } = await import(
        '../services/notification-center.service'
      );
      const changed = markAllNotificationsRead(req.auth!.subjectId, 'admin');
      res.json({ marked: changed });
    } catch (err) {
      next(err);
    }
  }
);

/* ============================================================
 * DONANIM TALEPLERİ — admin review
 * ============================================================ */

router.get(
  '/hardware/requests',
  requireAdmin,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = hardwareRequestsFilterSchema.parse(req.query);
      res.json({ items: listAdminHardwareRequests(status) });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/hardware/requests/:id/review',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz talep id.', 'INVALID_ID');
      }
      const input = reviewHardwareRequestSchema.parse(req.body);
      const request = reviewHardwareRequest(req.auth!.subjectId, id, input);
      recordAudit({
        eventType: 'hardware_request.reviewed',
        subjectId: req.auth!.subjectId,
        subjectType: 'admin',
        ipAddress: req.ip,
        success: true,
        details: { requestId: request.id, action: input.action, status: request.status },
      });
      res.json({ request });
    } catch (err) {
      next(err);
    }
  }
);

/* ============================================================
 * DESTEK TALEPLERİ — admin
 * ============================================================ */

router.get(
  '/support/requests',
  requireAdmin,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = supportRequestsFilterSchema.parse(req.query);
      res.json({ items: listAdminSupportRequests(status) });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/support/requests/:id/resolve',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz talep id.', 'INVALID_ID');
      }
      const request = resolveSupportRequest(req.auth!.subjectId, id);
      recordAudit({
        eventType: 'support_request.resolved',
        subjectId: req.auth!.subjectId,
        subjectType: 'admin',
        ipAddress: req.ip,
        success: true,
        details: { requestId: request.id },
      });
      res.json({ request });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
