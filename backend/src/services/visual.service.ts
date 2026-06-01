/**
 * Görsel üretim servisi (gorsel_uretim entegrasyonu).
 * Akış: fikir+tema → prompt enhance → provider üretir → DB'ye 'ready' yazılır.
 * Her görsel giriş yapan kullanıcıya bağlıdır (IDOR koruması: sahiplik kontrolü).
 */
import { nanoid } from 'nanoid';
import { getDb } from '../db/schema';
import { HttpError } from '../middleware/error.middleware';
import { enhancePrompt } from './prompt-enhancer.service';
import { getImageProvider, variantSeed } from './image-gen.service';

export type VisualStatus = 'pending' | 'enhancing' | 'generating' | 'ready' | 'error';

export interface VisualVariant {
  seed: number;
  url: string;
  created_at: number;
}

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

function getRow(id: string): VisualRow | undefined {
  return getDb().prepare('SELECT * FROM visuals WHERE id = ?').get(id) as VisualRow | undefined;
}

export function getVisualForUser(userId: string, id: string): VisualDto | undefined {
  const row = getRow(id);
  if (!row || row.user_id !== userId) return undefined;
  return rowToDto(row);
}

export function listMyVisuals(userId: string, limit = 24): VisualDto[] {
  const rows = getDb()
    .prepare('SELECT * FROM visuals WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(userId, Math.min(Math.max(limit, 1), 100)) as VisualRow[];
  return rows.map(rowToDto);
}

export interface CreateVisualInput {
  fikir: string;
  tema?: string;
  roomId?: string;
}

export async function createVisual(userId: string, input: CreateVisualInput): Promise<VisualDto> {
  const db = getDb();
  const id = nanoid();

  // Oda verildiyse geçerli mi? (opsiyonel bağ)
  const roomId = input.roomId
    ? ((db.prepare('SELECT id FROM rooms WHERE id = ? AND is_active = 1').get(input.roomId) as
        | { id: string }
        | undefined)?.id ?? null)
    : null;

  db.prepare(
    `INSERT INTO visuals (id, user_id, room_id, fikir, tema, status)
     VALUES (?, ?, ?, ?, ?, 'enhancing')`
  ).run(id, userId, roomId, input.fikir.trim(), input.tema?.trim() || null);

  try {
    const promptEn = await enhancePrompt({ fikir: input.fikir, tema: input.tema });
    db.prepare(`UPDATE visuals SET prompt_en = ?, status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
      promptEn,
      id
    );

    const result = await getImageProvider().generate({ prompt: promptEn });
    const variant: VisualVariant = {
      seed: result.seed,
      url: result.url,
      created_at: Math.floor(Date.now() / 1000),
    };

    db.prepare(
      `UPDATE visuals
       SET prompt_en = ?, image_url = ?, seed = ?, status = 'ready',
           variant_index = 0, variants = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(promptEn, result.url, result.seed, JSON.stringify([variant]), id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(`UPDATE visuals SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
      message,
      id
    );
  }

  return getVisualForUser(userId, id)!;
}

export async function regenerateVisual(userId: string, visualId: string): Promise<VisualDto> {
  const db = getDb();
  const row = getRow(visualId);
  if (!row || row.user_id !== userId) {
    throw new HttpError(404, 'Görsel bulunamadı.', 'VISUAL_NOT_FOUND');
  }
  if (!row.prompt_en) {
    throw new HttpError(409, 'Prompt henüz hazır değil.', 'PROMPT_NOT_READY');
  }

  const existing = parseVariants(row.variants);
  const newIndex = existing.length;
  const newSeed = variantSeed(row.prompt_en, newIndex);

  try {
    const result = await getImageProvider().generate({ prompt: row.prompt_en, seed: newSeed });
    const variant: VisualVariant = {
      seed: result.seed,
      url: result.url,
      created_at: Math.floor(Date.now() / 1000),
    };
    const variants = [...existing, variant];

    db.prepare(
      `UPDATE visuals
       SET image_url = ?, seed = ?, status = 'ready', variant_index = ?,
           variants = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(result.url, result.seed, newIndex, JSON.stringify(variants), visualId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.prepare(`UPDATE visuals SET status = 'error', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(
      message,
      visualId
    );
    throw new HttpError(502, `Görsel üretilemedi: ${message}`, 'GENERATION_FAILED');
  }

  return getVisualForUser(userId, visualId)!;
}
