/**
 * Showcase "feed" — public galeri verisini TEK çağrıda toplar (#3).
 *
 * Önceden frontend 3 ayrı istek atıyordu (items + technologies + engagement).
 * Burada tek bundle'da birleştirilir → 3 round-trip yerine 1.
 *
 * Server-side cache:
 *  - Ağır kısım (bookings⋈rooms⋈users join + teknoloji sayımı) DEĞİŞKEN değil,
 *    bu yüzden 30 sn TTL ile bellekte cache'lenir.
 *  - Volatil kısım (like/comment sayıları) HER ZAMAN taze hesaplanır (ucuz GROUP BY),
 *    böylece beğeni/yorum anında yansır.
 *  - Galeriyi değiştiren mutasyonlar (showcase görseli, görünürlük toggle) cache'i
 *    açıkça invalidate eder; admin onay/red gibi seyrek değişimler 30 sn TTL ile yakalanır.
 */
import { getDb } from '../db/schema';
import { getShowcaseEngagement } from './showcase.service';

export interface ShowcaseItem {
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
  showcaseImageUrl: string | null;
}

export interface ShowcaseTechnology {
  technology: string;
  count: number;
}

export interface ShowcaseFeed {
  items: ShowcaseItem[];
  total: number;
  technologies: ShowcaseTechnology[];
  engagement: Record<string, { likes: number; comments: number }>;
  generatedAt: string;
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
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    /* ignore */
  }
  return [];
}

function queryItems(): ShowcaseItem[] {
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

  return rows.map((r) => ({
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
}

function queryTechnologies(): ShowcaseTechnology[] {
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
  return [...counts.entries()]
    .map(([technology, count]) => ({ technology, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);
}

/** Ağır (stabil) kısmın cache'i — items + technologies. */
let stableCache: { items: ShowcaseItem[]; technologies: ShowcaseTechnology[]; expiresAt: number } | null =
  null;
const TTL_MS = 30_000;

function getStable(): { items: ShowcaseItem[]; technologies: ShowcaseTechnology[] } {
  const now = Date.now();
  if (!stableCache || stableCache.expiresAt <= now) {
    stableCache = {
      items: queryItems(),
      technologies: queryTechnologies(),
      expiresAt: now + TTL_MS,
    };
  }
  return { items: stableCache.items, technologies: stableCache.technologies };
}

/** Galeri içeriği değiştiğinde (görsel/görünürlük/onay) cache'i temizler. */
export function invalidateShowcaseFeed(): void {
  stableCache = null;
}

/** Tüm showcase bundle'ı — items(cache) + technologies(cache) + engagement(taze). */
export function getShowcaseFeed(): ShowcaseFeed {
  const { items, technologies } = getStable();
  return {
    items,
    total: items.length,
    technologies,
    engagement: getShowcaseEngagement(), // her çağrıda taze — beğeni/yorum anında yansır
    generatedAt: new Date().toISOString(),
  };
}

/** Eski /showcase route'u için (cache paylaşımlı). */
export function getShowcaseItems(): { items: ShowcaseItem[]; total: number } {
  const { items } = getStable();
  return { items, total: items.length };
}

/** Eski /showcase/technologies route'u için (cache paylaşımlı). */
export function getShowcaseTechnologies(): ShowcaseTechnology[] {
  return getStable().technologies;
}
