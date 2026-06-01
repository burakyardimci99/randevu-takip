/**
 * Public (auth gerektirmeyen) endpoint'ler.
 *
 * Kullanım amacı: Vibe coding showcase galerisi — onaylanan ve `showcase_visible=1`
 * olan projeler herkese (giriş yapmadan) gösterilebilir.
 *
 * Güvenlik:
 * - Sadece `status='approved' AND showcase_visible=1` döner.
 * - PII (kullanıcı e-postası) ASLA dönmez; sadece full_name (kullanıcı opt-in varsayılır
 *   demo için; production'da showcase_visible kullanıcı consent ile bağlanmalı).
 * - Read-only; herhangi bir mutation yok.
 * - Rate limit globalde uygulanır.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { getDb } from '../db/schema';
import { getPublicProfile } from '../services/public-profile.service';
import { getShowcaseEngagement } from '../services/showcase.service';
import {
  getShowcaseFeed,
  getShowcaseItems,
  getShowcaseTechnologies,
} from '../services/showcase-feed.service';
import {
  isSafeVisualId,
  safeSeed,
  serveStoredImage,
} from '../services/visual-store.service';
import { getRoomKiosk, listKioskRooms } from '../services/kiosk.service';
import { HttpError } from '../middleware/error.middleware';

const router = Router();

/**
 * Showcase FEED — galeri verisini TEK çağrıda toplar (#3): items + technologies
 * + engagement. Frontend Showcase.tsx artık 3 yerine 1 istek atar. Server-side
 * cache showcase-feed.service'te (items/technologies 30s TTL, engagement taze).
 */
router.get('/showcase/feed', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(getShowcaseFeed());
  } catch (err) {
    next(err);
  }
});

// Eski tekil endpoint'ler — geriye uyum (aynı cache'li servisi kullanır).
router.get('/showcase', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(getShowcaseItems());
  } catch (err) {
    next(err);
  }
});

/** Showcase için top teknolojiler (etiket bulutu). */
router.get('/showcase/technologies', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ technologies: getShowcaseTechnologies() });
  } catch (err) {
    next(err);
  }
});

/* ============ PUBLIC USER PROFILE ============ */

router.get('/users/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id ?? '');
    if (id.length < 8 || id.length > 40) {
      next(new (require('../middleware/error.middleware').HttpError)(400, 'Geçersiz id.', 'INVALID_ID'));
      return;
    }
    res.json({ profile: getPublicProfile(id) });
  } catch (err) {
    next(err);
  }
});

/* ============ SHOWCASE ENGAGEMENT (public) ============ */

router.get('/showcase/engagement', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ engagement: getShowcaseEngagement() });
  } catch (err) {
    next(err);
  }
});

/* ============ GÖRSEL PROXY (saklanan baytlar) ============ */

/**
 * Saklanan görsel baytlarını serve eder (veri-yönetişimi: prompt URL'de DEĞİL +
 * provider uptime'ından bağımsız). `?v=<seed>` verilirse o varyant; verilmezse
 * görselin güncel seed'i (DB'den). Saklanan dosya yoksa 404 — bu durumda görselin
 * image_url'i zaten dış URL'dedir (graceful fallback), bu route hiç çağrılmaz.
 *
 * Public: showcase galerisi (auth'suz) arkaplan görsellerini bu URL'den yükler.
 * id nanoid (tahmin edilemez); IDOR riski yok — yalnız saklanan görsel serve edilir.
 */
router.get('/visuals/:id/image', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id ?? '');
    if (!isSafeVisualId(id)) {
      throw new HttpError(400, 'Geçersiz görsel id.', 'INVALID_ID');
    }
    let seed = safeSeed(req.query.v);
    if (seed === null) {
      // ?v yoksa görselin güncel seed'ini DB'den çöz.
      const row = getDb().prepare('SELECT seed FROM visuals WHERE id = ?').get(id) as
        | { seed: number | null }
        | undefined;
      seed = row?.seed ?? null;
    }
    if (seed === null) {
      res.status(404).end();
      return;
    }
    const served = await serveStoredImage(res, id, seed);
    if (!served) res.status(404).end();
  } catch (err) {
    next(err);
  }
});

/* ============ KIOSK — oda ekranı (#5b) ============ */

/** Kiosk seçici için aktif odaların minimal listesi. */
router.get('/rooms', (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ rooms: listKioskRooms() });
  } catch (err) {
    next(err);
  }
});

/**
 * Bir odanın kiosk verisi: oda + son üretilen 'ready' görsel (yoksa idle screen).
 * Public (oda ekranı); yalnız görsel iç URL'i + zaman + oda bilgisi (PII yok).
 */
router.get('/rooms/:id/kiosk', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id ?? '');
    if (id.length < 8 || id.length > 40) {
      throw new HttpError(400, 'Geçersiz oda id.', 'INVALID_ID');
    }
    const data = getRoomKiosk(id);
    if (!data) {
      throw new HttpError(404, 'Oda bulunamadı.', 'ROOM_NOT_FOUND');
    }
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
