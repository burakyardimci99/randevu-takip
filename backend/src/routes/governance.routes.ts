/**
 * Kullanıcı yönetişim rolleri için route'lar.
 *
 *  /governance/danisman/* → Analitik Danışman (RACI: R/A "Başvuru değerlendirme")
 *    - License request + booking inbox + approve/reject/feedback/SWAT aksiyonları
 *  /governance/arge/*      → YZ/Ar-Ge Mühendisi (RACI: R/A "Stage onayı / Production onayı / Rollback")
 *    - Onaylı projeler + advance/regress stage + advance request yönetimi
 *
 * Tüm endpoint'ler:
 *  - requireUser → kullanıcı JWT zorunlu
 *  - csrfProtection → state-changing mutations CSRF token zorunlu
 *  - requireUserGovernanceRole → ilgili rol yetkisi zorunlu
 *
 * Mevcut admin service fonksiyonları yeniden kullanılır — yetki ek olarak rol
 * tabanlı; davranış, ses ve audit aynı kalır (subjectId = user id).
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireArge, requireDanisman } from '../middleware/auth.middleware';
import { csrfProtection } from '../middleware/cookie-auth';
import { HttpError } from '../middleware/error.middleware';
import {
  reviewBookingSchema,
  reviewLicenseRequestSchema,
} from '../validators/schemas';
import {
  advanceBookingLifecycle,
  getBookingByIdAdmin,
  listAllBookings,
  regressBookingLifecycle,
  rejectStageAdvanceRequest,
  reviewBooking,
} from '../services/booking.service';
import {
  listAdminLicenseRequests,
  reviewLicenseRequest,
} from '../services/license-request.service';

const router = Router();
router.use(csrfProtection);

/* ============================================================
 * ANALITIK DANIŞMAN — Başvuru değerlendirme inbox
 * Tüm danisman endpoint'leri kind='danisman' token bekler (ayrı audience).
 * ============================================================ */

const danismanGuard = requireDanisman;

/** Danışmanın inbox'ı — license_requests + pending/feedback booking'ler. */
router.get('/danisman/inbox', danismanGuard, (_req, res, next) => {
  try {
    const licenseRequests = listAdminLicenseRequests();
    const bookings = listAllBookings();
    // Danışman için anlamlı durumlar: pending + feedback_requested.
    const pendingBookings = bookings.filter(
      (b) => b.status === 'pending' || b.status === 'feedback_requested'
    );
    res.json({
      licenseRequests,
      bookings: pendingBookings,
      counts: {
        licenseRequestsPending: licenseRequests.filter((r) => r.status === 'pending').length,
        bookingsPending: pendingBookings.filter((b) => b.status === 'pending').length,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Danışman: booking review (approve / reject / request_feedback). */
router.post(
  '/danisman/bookings/:id/review',
  danismanGuard,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
      }
      const input = reviewBookingSchema.parse(req.body);
      const result = reviewBooking(req.auth!.subjectId, id, input, 'danisman');
      res.json({
        booking: result.booking,
        autoWaitlisted: result.autoWaitlisted ?? false,
        waitlistPosition: result.waitlistPosition,
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Danışman: license request review (approve / reject / feedback / swat). */
router.post(
  '/danisman/license-requests/:id/review',
  danismanGuard,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz license id.', 'INVALID_ID');
      }
      const input = reviewLicenseRequestSchema.parse(req.body);
      const updated = reviewLicenseRequest(req.auth!.subjectId, id, input, 'danisman');
      res.json({ request: updated });
    } catch (err) {
      next(err);
    }
  }
);

/* ============================================================
 * YZ / Ar-Ge — Stage + Production onayları
 * ============================================================ */

const argeGuard = requireArge;

/** Ar-Ge dashboard — onaylı projeler (özellikle advance request veya stage/production'da olanlar). */
router.get('/arge/projects', argeGuard, (_req, res, next) => {
  try {
    const bookings = listAllBookings({ status: 'approved' });
    res.json({
      projects: bookings,
      counts: {
        total: bookings.length,
        withAdvanceRequest: bookings.filter((b) => !!b.stageAdvanceRequestedAt).length,
        inStage: bookings.filter((b) => b.lifecycleStage === 'stage').length,
        inProduction: bookings.filter((b) => b.lifecycleStage === 'production').length,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Ar-Ge: bir projeyi bir sonraki aşamaya ilerlet. */
router.post(
  '/arge/bookings/:id/advance-stage',
  argeGuard,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
      }
      const booking = advanceBookingLifecycle(req.auth!.subjectId, id, 'arge');
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

/** Ar-Ge: bir projeyi bir önceki aşamaya geri al (rollback). */
router.post(
  '/arge/bookings/:id/regress-stage',
  argeGuard,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
      }
      const booking = regressBookingLifecycle(req.auth!.subjectId, id, 'arge');
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

/** Ar-Ge: kullanıcının aşama ilerletme talebini reddet. */
router.delete(
  '/arge/bookings/:id/advance-request',
  argeGuard,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
      }
      const booking = rejectStageAdvanceRequest(req.auth!.subjectId, id);
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

/** Ar-Ge: tek booking detay (modal için). */
router.get('/arge/bookings/:id', argeGuard, (req, res, next) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
    }
    const booking = getBookingByIdAdmin(id);
    if (!booking) throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
 * BİLDİRİM MERKEZİ — Danışman & Ar-Ge
 * Danışman/Ar-Ge subject'i users tablosunda yaşar → recipient_type 'user'.
 * NotificationCenter `/{kind}/notifications` çağırır; user/admin için doğrudan
 * route var, danisman/arge için bu governance-prefixed eşdeğerleri kullanılır.
 * ============================================================ */
const GOVERNANCE_ROLES: ReadonlyArray<{ prefix: 'danisman' | 'arge'; guard: typeof danismanGuard }> = [
  { prefix: 'danisman', guard: danismanGuard },
  { prefix: 'arge', guard: argeGuard },
];

for (const { prefix, guard } of GOVERNANCE_ROLES) {
  router.get(
    `/${prefix}/notifications`,
    guard,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { listNotifications, countUnreadNotifications } = await import(
          '../services/notification-center.service'
        );
        const uid = req.auth!.subjectId;
        res.json({
          items: listNotifications(uid, 'user'),
          unread: countUnreadNotifications(uid, 'user'),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    `/${prefix}/notifications/:id/read`,
    guard,
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
        markNotificationRead(req.auth!.subjectId, 'user', id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    `/${prefix}/notifications/read-all`,
    guard,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { markAllNotificationsRead } = await import(
          '../services/notification-center.service'
        );
        const marked = markAllNotificationsRead(req.auth!.subjectId, 'user');
        res.json({ marked });
      } catch (err) {
        next(err);
      }
    }
  );

  // Destek talebi — danışman/ar-ge de (subject = user) destek isteyebilsin.
  router.post(
    `/${prefix}/support/requests`,
    guard,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { createSupportRequestSchema } = await import('../validators/schemas');
        const { createSupportRequest } = await import('../services/support-request.service');
        const { recordAudit } = await import('../services/audit.service');
        const input = createSupportRequestSchema.parse(req.body);
        const request = createSupportRequest(req.auth!.subjectId, input.description);
        recordAudit({
          eventType: 'support_request.created',
          subjectId: req.auth!.subjectId,
          subjectType: 'user',
          ipAddress: req.ip,
          success: true,
          details: { requestId: request.id, via: prefix },
        });
        res.status(201).json({ request });
      } catch (err) {
        next(err);
      }
    }
  );
}

export default router;
