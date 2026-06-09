/**
 * Paylaşılan DTO tipleri (#6) — backend ile frontend ARASINDA tek kaynak.
 *
 * Buradaki tipler API sözleşmesini temsil eder; hem backend (servis/route dönüş
 * tipi) hem frontend (api.ts/bileşen prop) AYNI tanımı import eder → tekrar yok,
 * drift yok. Yalnız TİP (interface/type) içerir, runtime kod YOK → `import type`
 * ile erime; tsx/Vite runtime'ında tamamen silinir.
 *
 * Tüketim:
 *  - backend: `import type { ... } from '@klab/shared'` (tsconfig paths)
 *  - frontend: `import type { ... } from '@klab/shared'` (vite alias + tsconfig paths)
 */

/* ============ Görsel üretimi ============ */

export type VisualStatus = 'pending' | 'enhancing' | 'generating' | 'ready' | 'error';

export interface VisualVariant {
  seed: number;
  /** Saklandıysa iç (prompt'suz) URL, değilse dış sağlayıcı URL'i (fallback). */
  url: string;
  /** Baytlar sunucuda saklandı mı. */
  stored?: boolean;
  /** Saklanan dosya uzantısı (jpg/png/webp…). */
  ext?: string;
  created_at: number;
}

/* ============ Showcase / Envanter ============ */

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
  /** Yazarın profil fotoğrafı (base64 data URL) — yoksa null (baş harf gösterilir). */
  authorPhoto: string | null;
  periodMonths: number;
  startDate: string;
  endDate: string;
  isHighlight: boolean;
  approvedAt: string | null;
  /** Sahibinin atadığı arkaplan görseli (kendi ürettiği visual'den) — null olabilir. */
  showcaseImageUrl: string | null;
}

export interface ShowcaseTechnology {
  technology: string;
  count: number;
}

/* ============ Semantic search / eşleştirme (#4) ============ */

export interface SimilarBooking {
  bookingId: string;
  similarity: number;
  projectName: string;
  projectDescription: string;
  technologies: string[];
  status: string;
  roomCode: string;
  roomName: string;
  userFullName: string;
  /** İfşa edilen sonuçlarda sahip user id'si — "Bağlan" (/u/:id) için. Anonimde yok. */
  authorId?: string;
  isOwn?: boolean;
  anonymized?: boolean;
  createdAt: string;
}

/** Yeni booking'de otomatik duplicate-tespiti sonucu. */
export interface DuplicateMatch {
  bookingId: string;
  projectName: string;
  similarity: number;
  isOwn: boolean;
  authorFullName: string;
  roomCode: string;
}

/* ============ Leaderboard / Sıralama (#5a) ============ */

export interface LeaderboardUser {
  userId: string;
  fullName: string;
  department: string | null;
  /** Kullanıcının seçtiği profil arka plan görseli (kart arka planı). */
  profileBackgroundUrl: string | null;
  approvedBookings: number;
  utilizationDays: number;
  likes: number;
  comments: number;
  score: number;
}

export interface LeaderboardProject {
  bookingId: string;
  projectName: string;
  authorId: string;
  authorFullName: string;
  roomCode: string;
  roomName: string;
  isHighlight: boolean;
  likes: number;
  comments: number;
  score: number;
}

export interface Leaderboard {
  users: LeaderboardUser[];
  projects: LeaderboardProject[];
  generatedAt: string;
  scoring: { bookings: number; utilizationDay: number; like: number; comment: number };
}

/* ============ Oda × gün ısı-haritası (#5c) ============ */

export interface HeatmapCell {
  weekday: number; // 1=Pzt..7=Paz
  count: number;
}

export interface HeatmapRoom {
  roomId: string;
  code: string;
  name: string;
  theme: string;
  roomType: 'pod' | 'experience' | 'tribune';
  days: HeatmapCell[];
  total: number;
}

export interface RoomHeatmap {
  rooms: HeatmapRoom[];
  from: string;
  to: string;
  maxCount: number;
  weekdays: number[];
}

/* ============ Kiosk — oda ekranı (#5b) ============ */

export interface KioskRoom {
  id: string;
  code: string;
  name: string;
  theme: string;
  equipment: string;
  roomType: 'pod' | 'experience' | 'tribune';
}

export interface KioskData {
  room: KioskRoom;
  latestVisual: { imageUrl: string; createdAt: string } | null;
}
