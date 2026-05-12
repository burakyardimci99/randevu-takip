/**
 * User-facing routes: odalar + booking.
 * Path: /api/user/*
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireUser } from '../middleware/auth.middleware';
import {
  createBookingSchema,
  joinWaitlistSchema,
  profileUpdateSchema,
  similarSearchSchema,
} from '../validators/schemas';
import { listRooms } from '../services/room.service';
import {
  createBooking,
  deleteBooking,
  getBookingByIdForUser,
  listUserBookings,
  updateBooking,
} from '../services/booking.service';
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
import { recordAudit } from '../services/audit.service';
import { HttpError } from '../middleware/error.middleware';
import { getDb } from '../db/schema';

const router = Router();

router.use(requireUser);

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

router.get('/rooms', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ rooms: listRooms() });
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
      const updated = getBookingByIdForUser(req.auth!.subjectId, id);
      res.json({ booking: updated });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
