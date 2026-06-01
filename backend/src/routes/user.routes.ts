/**
 * User-facing routes: odalar + booking.
 * Path: /api/user/*
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireUser } from '../middleware/auth.middleware';
import {
  createAppointmentSchema,
  createBookingSchema,
  createHardwareRequestSchema,
  createLicenseRequestSchema,
  createSupportRequestSchema,
  createVisualSchema,
  setShowcaseImageSchema,
  joinWaitlistSchema,
  profileUpdateSchema,
  similarSearchSchema,
  stageAdvanceRequestSchema,
} from '../validators/schemas';
import { listRooms } from '../services/room.service';
import {
  createBooking,
  deleteBooking,
  getBookingByIdForUser,
  listUserBookings,
  requestStageAdvance,
  updateBooking,
} from '../services/booking.service';
import {
  cancelAppointment,
  createAppointment,
  listBookingAppointments,
  listUserAppointments,
} from '../services/appointment.service';
import { getUserProfile, updateUserProfile } from '../services/user.service';
import {
  cancelWaitlist,
  joinWaitlist,
  listUserWaitlist,
} from '../services/waitlist.service';
import {
  bookingTextForEmbedding,
  findSimilarBookings,
} from '../services/embedding.service';
import { exportUserData, purgeUser } from '../services/privacy.service';
import { getUserLicenseUsage } from '../services/license.service';
import {
  createHardwareRequest,
  listUserHardwareRequests,
  updateHardwareRequest,
} from '../services/hardware-request.service';
import { createSupportRequest } from '../services/support-request.service';
import {
  createVisual,
  listMyVisuals,
  regenerateVisual,
  setBookingShowcaseImage,
} from '../services/visual.service';
import {
  clearUserProfilePhoto,
  setUserProfilePhoto,
} from '../services/profile-photo.service';
import {
  getLikeStatus,
  getShowcaseEngagement,
  listComments,
  postComment,
  toggleLike,
  deleteComment,
} from '../services/showcase.service';
import { recordAudit } from '../services/audit.service';
import { csrfProtection } from '../middleware/cookie-auth';
import { HttpError } from '../middleware/error.middleware';
import { getDb } from '../db/schema';

const router = Router();

router.use(requireUser);

// CSRF — tüm state-changing endpoint'leri (POST/PUT/DELETE/PATCH) korur.
// GET/HEAD/OPTIONS csrf-csrf'in `ignoredMethods` config'i ile muaf.
// Frontend api.ts mutation isteklerinde X-CSRF-Token header'ını otomatik
// gönderir; CSRF rotasyonunda 403 alırsa fresh token ile retry yapar.
router.use(csrfProtection);

/* ============ PROFİL ============ */

router.get('/profile', (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = getUserProfile(req.auth!.subjectId);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

router.put('/profile', (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = profileUpdateSchema.parse(req.body);
    const profile = updateUserProfile(req.auth!.subjectId, input);
    res.json({ profile });
  } catch (err) {
    next(err);
  }
});

router.get('/rooms', (req: Request, res: Response, next: NextFunction) => {
  try {
    // Opsiyonel takvim filtresi: ?date=YYYY-MM-DD → uygunluk o güne göre.
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    res.json({ rooms: listRooms(date) });
  } catch (err) {
    next(err);
  }
});

router.get('/bookings', (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookings = listUserBookings(req.auth!.subjectId);
    res.json({ bookings });
  } catch (err) {
    next(err);
  }
});

router.post('/bookings', (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createBookingSchema.parse(req.body);
    const booking = createBooking(req.auth!.subjectId, input);

    recordAudit({
      eventType: 'booking.created',
      subjectId: req.auth!.subjectId,
      subjectType: 'user',
      ipAddress: req.ip,
      success: true,
      details: {
        bookingId: booking.id,
        roomCode: booking.roomCode,
        periodMonths: booking.periodMonths,
      },
    });

    res.status(201).json({ booking });
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
    const booking = getBookingByIdForUser(req.auth!.subjectId, id);
    if (!booking) throw new HttpError(404, 'Booking bulunamadı.', 'NOT_FOUND');
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

/**
 * Booking düzenle (PUT) — yalnızca kullanıcının kendi pending/feedback_requested talepleri.
 * Düzenleme sonrası status → 'pending' (admin tekrar incelesin).
 */
router.put('/bookings/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
    }
    const input = createBookingSchema.parse(req.body);
    const booking = updateBooking(req.auth!.subjectId, id, input);

    recordAudit({
      eventType: 'booking.updated',
      subjectId: req.auth!.subjectId,
      subjectType: 'user',
      ipAddress: req.ip,
      success: true,
      details: {
        bookingId: booking.id,
        roomCode: booking.roomCode,
        periodMonths: booking.periodMonths,
      },
    });

    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

/**
 * Booking geri çek (DELETE) — yalnızca pending/feedback_requested.
 */
router.delete('/bookings/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
    }
    const result = deleteBooking(req.auth!.subjectId, id);

    recordAudit({
      eventType: 'booking.withdrawn',
      subjectId: req.auth!.subjectId,
      subjectType: 'user',
      ipAddress: req.ip,
      success: true,
      details: { bookingId: id, roomId: result.roomId },
    });

    // Waitlist promote (async, fire-and-forget)
    void import('../services/waitlist.service').then((m) =>
      m.tryPromoteForRoom(result.roomId)
    );

    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

/* ============ WAITLIST ============ */

router.get('/waitlist', (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ entries: listUserWaitlist(req.auth!.subjectId) });
  } catch (err) {
    next(err);
  }
});

router.post('/waitlist', (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = joinWaitlistSchema.parse(req.body);
    const entry = joinWaitlist(req.auth!.subjectId, input);
    res.status(201).json({ entry });
  } catch (err) {
    next(err);
  }
});

router.delete('/waitlist/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz id.', 'INVALID_ID');
    }
    cancelWaitlist(req.auth!.subjectId, id);
    res.json({ cancelled: true });
  } catch (err) {
    next(err);
  }
});

/* ============ SEMANTIC SEARCH (Proje benzerlik) ============ */

router.post('/similar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = similarSearchSchema.parse(req.body);

    let queryText = '';
    let excludeBookingId: string | undefined;

    if (input.bookingId) {
      // Var olan bir booking'in benzerlerini bul — IDOR koruması:
      // user yalnızca kendi booking'ini referans alabilir
      const own = getBookingByIdForUser(req.auth!.subjectId, input.bookingId);
      if (!own) {
        throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
      }
      queryText = bookingTextForEmbedding({
        projectName: own.projectName,
        projectDescription: own.projectDescription,
        technologies: own.technologies,
      });
      excludeBookingId = own.id;
    } else {
      queryText = bookingTextForEmbedding({
        projectName: input.projectName ?? '',
        projectDescription: input.projectDescription ?? '',
        technologies: input.technologies ?? [],
      });
    }

    // PRIVACY: user-tarafı yalnız opt-in showcase görür + kendi geçmişi
    const results = await findSimilarBookings({
      queryText,
      limit: input.limit ?? 5,
      excludeBookingId,
      minSimilarity: input.minSimilarity ?? 0.3,
      visibility: 'showcase',
      includeOwner: req.auth!.subjectId,
    });

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

/* ============ PROFİL FOTOĞRAFI ============ */

router.put('/me/photo', (req: Request, res: Response, next: NextFunction) => {
  try {
    const dataUrl = req.body?.dataUrl;
    if (typeof dataUrl !== 'string') {
      throw new HttpError(400, 'dataUrl eksik.', 'VALIDATION');
    }
    setUserProfilePhoto(req.auth!.subjectId, dataUrl);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/me/photo', (req: Request, res: Response, next: NextFunction) => {
  try {
    clearUserProfilePhoto(req.auth!.subjectId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ============ SHOWCASE — LIKE & COMMENT ============ */

router.get(
  '/showcase/:id/likes',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id ?? '');
      res.json(getLikeStatus(id, req.auth!.subjectId));
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/showcase/:id/like',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id ?? '');
      res.json(toggleLike(id, req.auth!.subjectId));
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/showcase/:id/comments',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id ?? '');
      res.json({ comments: listComments(id) });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/showcase/:id/comments',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id ?? '');
      const body = String(req.body?.body ?? '');
      const profile = getDb()
        .prepare('SELECT full_name FROM users WHERE id = ?')
        .get(req.auth!.subjectId) as { full_name: string } | undefined;
      const comment = postComment({
        bookingId: id,
        userId: req.auth!.subjectId,
        userFullName: profile?.full_name ?? 'Kullanıcı',
        body,
      });
      res.status(201).json({ comment });
    } catch (err) {
      next(err);
    }
  }
);

router.delete(
  '/showcase/comments/:id',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id ?? '');
      res.json(deleteComment(id, req.auth!.subjectId));
    } catch (err) {
      next(err);
    }
  }
);

router.get('/showcase/engagement', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ engagement: getShowcaseEngagement() });
  } catch (err) {
    next(err);
  }
});

/* ============ KENDİ LİSANS KULLANIMI ============ */

router.get('/me/licenses', (req: Request, res: Response, next: NextFunction) => {
  try {
    const usage = getUserLicenseUsage(req.auth!.subjectId);
    if (!usage) {
      // Aktif booking yok → boş response
      res.json({
        userId: req.auth!.subjectId,
        userFullName: '',
        userEmail: '',
        department: null,
        licenses: [],
        totalMonthlyUsd: 0,
        activeBookingCount: 0,
      });
      return;
    }
    res.json(usage);
  } catch (err) {
    next(err);
  }
});

/* ============ KVKK — Veri ihracı + Right to be Forgotten ============ */

/** Kullanıcı kendi verilerini JSON olarak indirir. */
router.get('/me/export', (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = exportUserData(req.auth!.subjectId);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="klab-veri-${req.auth!.subjectId}.json"`
    );
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    next(err);
  }
});

/**
 * Kullanıcı kendi hesabını ve verilerini siler.
 * Body: { confirmation: 'HESABIMI SİL' } (yanlışlıkla çağrı koruması)
 */
router.post('/me/purge', (req: Request, res: Response, next: NextFunction) => {
  try {
    const confirmation = req.body?.confirmation;
    if (confirmation !== 'HESABIMI SİL') {
      throw new HttpError(
        400,
        "Onay metni eksik. Lütfen 'HESABIMI SİL' yazın.",
        'VALIDATION'
      );
    }
    const result = purgeUser(req.auth!.subjectId, {
      id: req.auth!.subjectId,
      type: 'user',
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/* ============ SHOWCASE PERMISSION (kendi booking'i) ============ */

router.put(
  '/bookings/:id/showcase',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
      }
      const visible = req.body?.visible;
      if (typeof visible !== 'boolean') {
        throw new HttpError(400, "'visible' boolean olmalı.", 'VALIDATION');
      }
      const own = getBookingByIdForUser(req.auth!.subjectId, id);
      if (!own) throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
      const db = getDb();
      db.prepare(
        `UPDATE bookings SET showcase_visible = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ?`
      ).run(visible ? 1 : 0, id, req.auth!.subjectId);
      // Galeri içeriği değişti (proje eklendi/çıkarıldı) → showcase feed cache'ini tazele.
      void import('../services/showcase-feed.service').then((m) => m.invalidateShowcaseFeed());
      const updated = getBookingByIdForUser(req.auth!.subjectId, id);
      res.json({ booking: updated });
    } catch (err) {
      next(err);
    }
  }
);

/* ============================================================
 * LİSANSLAR — kullanıcı katalog & talep
 * ============================================================ */

router.get(
  '/licenses/catalog',
  requireUser,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { getLicenseCatalog } = await import('../services/license-request.service');
      res.json({ items: getLicenseCatalog() });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/licenses/requests',
  requireUser,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { listUserLicenseRequests } = await import('../services/license-request.service');
      const items = listUserLicenseRequests(req.auth!.subjectId);
      res.json({ items });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/licenses/requests',
  requireUser,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createLicenseRequestSchema.parse(req.body);
      const { createLicenseRequest } = await import('../services/license-request.service');
      const created = createLicenseRequest(req.auth!.subjectId, input);

      recordAudit({
        eventType: 'license_request.created',
        subjectId: req.auth!.subjectId,
        subjectType: 'user',
        ipAddress: req.ip,
        success: true,
        details: {
          requestId: created.id,
          requestTitle: created.requestTitle,
          itemCount: created.items.length,
          durationMonths: created.durationMonths,
        },
      });

      // Admin'lere yeni başvuru e-postası — otomatik reddedilen başvurular hariç.
      if (created.status !== 'rejected') {
        void (async () => {
          try {
            const { notifyAdminsLicenseRequested } = await import(
              '../services/license-request.service'
            );
            await notifyAdminsLicenseRequested(created);
          } catch {
            /* bildirim best-effort — talep yine de oluşturuldu */
          }
        })();
      }

      res.status(201).json({ request: created });
    } catch (err) {
      next(err);
    }
  }
);

router.put(
  '/licenses/requests/:id',
  requireUser,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz talep id.', 'INVALID_ID');
      }
      const input = createLicenseRequestSchema.parse(req.body);
      const { updateLicenseRequest } = await import('../services/license-request.service');
      const updated = updateLicenseRequest(req.auth!.subjectId, id, input);

      recordAudit({
        eventType: 'license_request.updated',
        subjectId: req.auth!.subjectId,
        subjectType: 'user',
        ipAddress: req.ip,
        success: true,
        details: { requestId: updated.id, status: updated.status },
      });

      res.json({ request: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Başvuru/proje detayı — yönetişim demeti dahil (kalite kapıları,
 * insan onayları, yaşam döngüsü zaman çizelgesi). IDOR: sadece kendi.
 */
router.get(
  '/licenses/requests/:id',
  requireUser,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz talep id.', 'INVALID_ID');
      }
      const { getUserLicenseRequestById } = await import(
        '../services/license-request.service'
      );
      const request = getUserLicenseRequestById(req.auth!.subjectId, id);
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

/* ============ BİLDİRİM MERKEZİ ============ */

router.get(
  '/notifications',
  requireUser,
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
  '/notifications/:id/read',
  requireUser,
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
  '/notifications/read-all',
  requireUser,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { markAllNotificationsRead } = await import(
        '../services/notification-center.service'
      );
      const changed = markAllNotificationsRead(req.auth!.subjectId, 'user');
      res.json({ marked: changed });
    } catch (err) {
      next(err);
    }
  }
);

/** Kullanıcı: aşama ilerletme talebi oluştur (admin'den onay bekler). */
router.post(
  '/bookings/:id/request-advance',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
      }
      const { note } = stageAdvanceRequestSchema.parse(req.body ?? {});
      const booking = requestStageAdvance(req.auth!.subjectId, id, note);
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

/* ============ APPOINTMENTS — günlük randevular ============ */

/** Kullanıcının kendi randevuları (varsayılan: scheduled, opsiyonel tarih aralığı). */
router.get('/appointments', (req: Request, res: Response, next: NextFunction) => {
  try {
    const fromRaw = req.query.from;
    const toRaw = req.query.to;
    const includeCancelled = req.query.includeCancelled === 'true';
    const from = typeof fromRaw === 'string' ? fromRaw : undefined;
    const to = typeof toRaw === 'string' ? toRaw : undefined;
    const appointments = listUserAppointments(req.auth!.subjectId, {
      from,
      to,
      includeCancelled,
    });
    res.json({ appointments });
  } catch (err) {
    next(err);
  }
});

/** Bir booking'in randevuları (sahibi görür). */
router.get(
  '/bookings/:id/appointments',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz booking id.', 'INVALID_ID');
      }
      // IDOR koruması: booking sahibi mi?
      const booking = getBookingByIdForUser(req.auth!.subjectId, id);
      if (!booking) {
        throw new HttpError(404, 'Booking bulunamadı.', 'BOOKING_NOT_FOUND');
      }
      const appointments = listBookingAppointments(id);
      res.json({ appointments });
    } catch (err) {
      next(err);
    }
  }
);

/** Yeni randevu oluştur. */
router.post('/appointments', (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createAppointmentSchema.parse(req.body);
    const appointment = createAppointment(req.auth!.subjectId, input);
    res.status(201).json({ appointment });
  } catch (err) {
    next(err);
  }
});

/** Randevu iptal et (kendi randevusu olmalı). */
router.delete(
  '/appointments/:id',
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId : '';
      if (!id || id.length < 8 || id.length > 40) {
        throw new HttpError(400, 'Geçersiz randevu id.', 'INVALID_ID');
      }
      const result = cancelAppointment(req.auth!.subjectId, id, {
        ownerCheck: true,
        callerType: 'user',
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

/* ============================================================
 * DONANIM TALEPLERİ — kullanıcı
 * ============================================================ */

router.get('/hardware/requests', (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ items: listUserHardwareRequests(req.auth!.subjectId) });
  } catch (err) {
    next(err);
  }
});

router.post('/hardware/requests', (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createHardwareRequestSchema.parse(req.body);
    const request = createHardwareRequest(req.auth!.subjectId, input);

    recordAudit({
      eventType: 'hardware_request.created',
      subjectId: req.auth!.subjectId,
      subjectType: 'user',
      ipAddress: req.ip,
      success: true,
      details: {
        requestId: request.id,
        equipmentType: request.equipmentType,
        quantity: request.quantity,
      },
    });

    res.status(201).json({ request });
  } catch (err) {
    next(err);
  }
});

router.put('/hardware/requests/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawId = req.params.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!id || id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz talep id.', 'INVALID_ID');
    }
    const input = createHardwareRequestSchema.parse(req.body);
    const request = updateHardwareRequest(req.auth!.subjectId, id, input);
    res.json({ request });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
 * DESTEK TALEBİ — kullanıcı
 * ============================================================ */

router.post('/support/requests', (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createSupportRequestSchema.parse(req.body);
    const request = createSupportRequest(req.auth!.subjectId, input.description);

    recordAudit({
      eventType: 'support_request.created',
      subjectId: req.auth!.subjectId,
      subjectType: 'user',
      ipAddress: req.ip,
      success: true,
      details: { requestId: request.id },
    });

    res.status(201).json({ request });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
 * GÖRSEL ÜRETİMİ — kullanıcı (gorsel_uretim entegrasyonu)
 * ============================================================ */

router.post('/visuals', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createVisualSchema.parse(req.body);
    const visual = await createVisual(req.auth!.subjectId, input);
    res.status(201).json({ visual });
  } catch (err) {
    next(err);
  }
});

router.get('/visuals', (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ visuals: listMyVisuals(req.auth!.subjectId) });
  } catch (err) {
    next(err);
  }
});

router.post('/visuals/:id/regenerate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : '';
    if (id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz görsel id.', 'INVALID_ID');
    }
    const visual = await regenerateVisual(req.auth!.subjectId, id);
    res.json({ visual });
  } catch (err) {
    next(err);
  }
});

// Proje (booking) kartına görsel arkaplan ata / kaldır.
router.put('/bookings/:id/showcase-image', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : '';
    if (id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz proje id.', 'INVALID_ID');
    }
    const input = setShowcaseImageSchema.parse(req.body);
    const result = setBookingShowcaseImage(req.auth!.subjectId, id, input.visualId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
