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
  isSafeVisualId,
  safeSeed,
  serveStoredImage,
} from '../services/visual-store.service';
import { HttpError } from '../middleware/error.middleware';

const router = Router();

interface ShowcaseItem {
  id: string;
  projectName: string;
  projectDescription: string;
  technologies: string[];
  roomCode: string;
  roomName: string;
  district: string;
  neighborhood: string;
  theme: string;
  authorId: string;
  authorFullName: string;
  periodMonths: number;
  startDate: string;
  endDate: string;
  isHighlight: boolean;
  approvedAt: string | null;
  /** Kullanıcının atadığı arkaplan görseli (kendi ürettiği visual'den). */
  showcaseImageUrl: string | null;
}

interface ShowcaseRow {
  id: string;
  project_name: string;
  project_description: string;
  technologies: string;
  room_code: string;
  room_name: string;
  district: string;
  neighborhood: string;
  theme: string;
  user_id: string;
  full_name: string;
  period_months: number;
  start_date: string;
  end_date: string;
  showcase_highlight: number;
  reviewed_at: string | null;
  showcase_image_url: string | null;
}

function parseTechs(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed))
      return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    /* ignore */
  }
  return [];
}

router.get('/showcase', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = getDb()
      .prepare(
        `SELECT b.id, b.project_name, b.project_description, b.technologies,
                b.period_months, b.start_date, b.end_date, b.showcase_highlight,
                b.reviewed_at, b.user_id, b.showcase_image_url,
                r.code AS room_code, r.name AS room_name, r.district, r.neighborhood, r.theme,
                u.full_name
         FROM bookings b
         INNER JOIN rooms r ON r.id = b.room_id
         INNER JOIN users u ON u.id = b.user_id
         WHERE b.status = 'approved' AND b.showcase_visible = 1
         ORDER BY b.showcase_highlight DESC, b.reviewed_at DESC
         LIMIT 60`
      )
      .all() as ShowcaseRow[];

    const items: ShowcaseItem[] = rows.map((r) => ({
      id: r.id,
      projectName: r.project_name,
      projectDescription: r.project_description,
      technologies: parseTechs(r.technologies),
      roomCode: r.room_code,
      roomName: r.room_name,
      district: r.district,
      neighborhood: r.neighborhood,
      theme: r.theme,
      authorId: r.user_id,
      authorFullName: r.full_name,
      periodMonths: r.period_months,
      startDate: r.start_date,
      endDate: r.end_date,
      isHighlight: r.showcase_highlight === 1,
      approvedAt: r.reviewed_at,
      showcaseImageUrl: r.showcase_image_url,
    }));

    res.json({ items, total: items.length });
  } catch (err) {
    next(err);
  }
});

/**
 * Showcase için top teknolojiler (etiket bulutu).
 */
router.get('/showcase/technologies', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = getDb()
      .prepare(
        `SELECT technologies FROM bookings
         WHERE status = 'approved' AND showcase_visible = 1`
      )
      .all() as Array<{ technologies: string }>;

    const counts = new Map<string, number>();
    for (const r of rows) {
      for (const t of parseTechs(r.technologies)) {
        const k = t.trim();
        if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    const result = [...counts.entries()]
      .map(([technology, count]) => ({ technology, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 30);
    res.json({ technologies: result });
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

export default router;
