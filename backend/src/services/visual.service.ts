/**
 * Görsel üretim servisi (gorsel_uretim entegrasyonu).
 * Akış: fikir+tema → prompt enhance → provider üretir → DB'ye 'ready' yazılır.
 * Her görsel giriş yapan kullanıcıya bağlıdır (IDOR koruması: sahiplik kontrolü).
 */
import { nanoid } from 'nanoid';
import { dbAll, dbOne, dbRun } from '../db/schema';
import { HttpError } from '../middleware/error.middleware';
import { getImageProvider, variantSeed } from './image-gen.service';
import { downloadAndStore, internalImageUrl } from './visual-store.service';
import { invalidateShowcaseFeed } from './showcase-feed.service';
import { broadcastToUser } from './sse.service';
// Paylaşılan DTO (backend↔frontend tek kaynak) — #6.
import type { VisualStatus, VisualVariant } from '@klab/shared';

export type { VisualStatus, VisualVariant };

export interface VisualDto {
  id: string;
  userId: string;
  roomId: string | null;
  fikir: string;
  tema: string | null;
  promptEn: string | null;
  imageUrl: string | null;
  seed: number | null;
  status: VisualStatus;
  errorMessage: string | null;
  variantIndex: number;
  variants: VisualVariant[];
  createdAt: string;
  updatedAt: string;
}

interface VisualRow {
  id: string;
  user_id: string;
  room_id: string | null;
  fikir: string;
  tema: string | null;
  prompt_en: string | null;
  image_url: string | null;
  seed: number | null;
  status: VisualStatus;
  error_message: string | null;
  variant_index: number;
  variants: string | null;
  created_at: string;
  updated_at: string;
}

function parseVariants(json: string | null): VisualVariant[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function rowToDto(r: VisualRow): VisualDto {
  return {
    id: r.id,
    userId: r.user_id,
    roomId: r.room_id,
    fikir: r.fikir,
    tema: r.tema,
    promptEn: r.prompt_en,
    imageUrl: r.image_url,
    seed: r.seed,
    status: r.status,
    errorMessage: r.error_message,
    variantIndex: r.variant_index,
    variants: parseVariants(r.variants),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function getRow(id: string): Promise<VisualRow | undefined> {
  return await dbOne('SELECT * FROM visuals WHERE id = ?', [id]) as VisualRow | undefined;
}

export async function getVisualForUser(userId: string, id: string): Promise<VisualDto | undefined> {
  const row = await getRow(id);
  if (!row || row.user_id !== userId) return undefined;
  return rowToDto(row);
}

export async function listMyVisuals(userId: string, limit = 24): Promise<VisualDto[]> {
  const rows = await dbAll('SELECT * FROM visuals WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, Math.min(Math.max(limit, 1), 100)]) as VisualRow[];
  return rows.map(rowToDto);
}

export interface CreateVisualInput {
  fikir: string;
  tema?: string;
  roomId?: string;
}

export async function createVisual(userId: string, input: CreateVisualInput): Promise<VisualDto> {
  const id = nanoid();

  // Oda verildiyse geçerli mi? (opsiyonel bağ)
  const roomId = input.roomId
    ? ((await dbOne('SELECT id FROM rooms WHERE id = ? AND is_active = 1', [input.roomId]) as
        | { id: string }
        | undefined)?.id ?? null)
    : null;

  await dbRun(`INSERT INTO visuals (id, user_id, room_id, fikir, tema, status)
     VALUES (?, ?, ?, ?, ?, 'enhancing')`, [id, userId, roomId, input.fikir.trim(), input.tema?.trim() || null]);

  // Üretim arkaplanda — istek bloklanmaz (UX + timeout dayanıklılığı). Bitince
  // 'visual.updated' SSE event'i kullanıcıya push'lanır.
  void runVisualPipeline(userId, id, input.fikir, input.tema);

  return (await getVisualForUser(userId, id))!; // status: 'enhancing'
}

/**
 * Üretilen görseli sunucuda saklamayı dener (veri-yönetişimi + provider
 * bağımsızlığı). Başarılıysa prompt'suz iç URL, değilse dış URL döner (fallback).
 */
async function persistVariant(
  id: string,
  seed: number,
  externalUrl: string
): Promise<{ url: string; stored: boolean; ext?: string; authError?: boolean }> {
  const result = await downloadAndStore(id, seed, externalUrl);
  if (result.ok) {
    return { url: internalImageUrl(id, seed), stored: true, ext: result.ext };
  }
  // Saklanamadı: 'auth' (token/ödeme) KALICI → çağıran error yapmalı; 'transient'
  // (zaman aşımı/5xx) ise dış URL'de fallback (provider sonra düzelir).
  return { url: externalUrl, stored: false, authError: result.reason === 'auth' };
}

/** Pollinations anonim erişim 402 verdiğinde gösterilecek net kullanıcı mesajı. */
const PROVIDER_AUTH_ERROR =
  'Görsel sağlayıcı kimlik doğrulama/ödeme gerektiriyor. Yöneticinin POLLINATIONS_TOKEN ' +
  'ayarlaması gerekiyor (auth.pollinations.ai üzerinden ücretsiz token alınır).';

/** Arkaplan boru hattı: prompt → generate → diske sakla → DB güncelle → SSE push. */
async function runVisualPipeline(
  userId: string,
  id: string,
  fikir: string,
  tema?: string
): Promise<void> {
  try {
    // Kullanıcı ne girdiyse onu kullan — AI prompt-enhancer (Claude/Pollinations-text) kaldırıldı.
    const promptEn = tema && tema.trim() ? `${fikir.trim()}, ${tema.trim()}` : fikir.trim();
    await dbRun(`UPDATE visuals SET prompt_en = ?, status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [promptEn,
      id]);

    const result = await getImageProvider().generate({ prompt: promptEn });
    // Üretilen görseli sunucuda sakla → image_url prompt'suz iç URL olur (fallback: dış URL).
    const persisted = await persistVariant(id, result.seed, result.url);
    // Sağlayıcı kimlik/ödeme istiyorsa (anonim 402) 'ready' deyip kırık URL VERME → net hata.
    if (!persisted.stored && persisted.authError) throw new Error(PROVIDER_AUTH_ERROR);
    const variant: VisualVariant = {
      seed: result.seed,
      url: persisted.url,
      stored: persisted.stored,
      ext: persisted.ext,
      created_at: Math.floor(Date.now() / 1000),
    };
    await dbRun(`UPDATE visuals
       SET prompt_en = ?, image_url = ?, seed = ?, status = 'ready',
           variant_index = 0, variants = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [promptEn, persisted.url, result.seed, JSON.stringify([variant]), id]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await dbRun(`UPDATE visuals SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [message,
      id]);
  } finally {
    broadcastToUser(userId, { type: 'visual.updated', data: { id } });
  }
}

export async function regenerateVisual(userId: string, visualId: string): Promise<VisualDto> {
  const row = await getRow(visualId);
  if (!row || row.user_id !== userId) {
    throw new HttpError(404, 'Görsel bulunamadı.', 'VISUAL_NOT_FOUND');
  }
  if (!row.prompt_en) {
    throw new HttpError(409, 'Prompt henüz hazır değil.', 'PROMPT_NOT_READY');
  }

  // Yeni varyant üretimi arkaplanda; istek hemen 'generating' döner, bitince SSE.
  await dbRun(`UPDATE visuals SET status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [visualId]);
  void runRegeneratePipeline(userId, visualId, row.prompt_en, parseVariants(row.variants));

  return (await getVisualForUser(userId, visualId))!; // status: 'generating'
}

async function runRegeneratePipeline(
  userId: string,
  visualId: string,
  promptEn: string,
  existing: VisualVariant[]
): Promise<void> {
  try {
    const newIndex = existing.length;
    const newSeed = variantSeed(promptEn, newIndex);
    const result = await getImageProvider().generate({ prompt: promptEn, seed: newSeed });
    // Yeni varyantı sunucuda sakla → iç URL (fallback: dış URL).
    const persisted = await persistVariant(visualId, result.seed, result.url);
    if (!persisted.stored && persisted.authError) throw new Error(PROVIDER_AUTH_ERROR);
    const variant: VisualVariant = {
      seed: result.seed,
      url: persisted.url,
      stored: persisted.stored,
      ext: persisted.ext,
      created_at: Math.floor(Date.now() / 1000),
    };
    await dbRun(`UPDATE visuals
       SET image_url = ?, seed = ?, status = 'ready', variant_index = ?,
           variants = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [persisted.url, result.seed, newIndex, JSON.stringify([...existing, variant]), visualId]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await dbRun(`UPDATE visuals SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [message,
      visualId]);
  } finally {
    broadcastToUser(userId, { type: 'visual.updated', data: { id: visualId } });
  }
}

/**
 * Kullanıcının kendi projesinin (booking) Envanter kartına, kendi ürettiği bir
 * görseli arkaplan olarak atar. visualId null ise arkaplanı kaldırır.
 * IDOR: hem booking hem visual aynı kullanıcıya ait olmalı.
 */
export async function setBookingShowcaseImage(
  userId: string,
  bookingId: string,
  visualId: string | null
): Promise<{ showcaseImageUrl: string | null }> {
  const booking = await dbOne('SELECT id, user_id FROM bookings WHERE id = ?', [bookingId]) as
    | { id: string; user_id: string }
    | undefined;
  if (!booking || booking.user_id !== userId) {
    throw new HttpError(404, 'Proje bulunamadı.', 'BOOKING_NOT_FOUND');
  }

  let imageUrl: string | null = null;
  if (visualId) {
    const v = await getRow(visualId);
    if (!v || v.user_id !== userId) {
      throw new HttpError(404, 'Görsel bulunamadı.', 'VISUAL_NOT_FOUND');
    }
    if (!v.image_url) {
      throw new HttpError(409, 'Bu görsel henüz hazır değil.', 'VISUAL_NOT_READY');
    }
    imageUrl = v.image_url;
  }

  await dbRun('UPDATE bookings SET showcase_image_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [imageUrl,
    bookingId]);
  invalidateShowcaseFeed(); // galeri kartı arkaplanı değişti → feed cache'ini tazele
  return { showcaseImageUrl: imageUrl };
}
