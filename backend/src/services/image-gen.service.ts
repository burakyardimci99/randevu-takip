/**
 * Görsel üretim soyutlaması (gorsel_uretim projesinden port — Express).
 *
 * Provider'lar:
 *  - "pollinations" (default): anahtarsız, URL-bazlı, Flux Schnell. Harici mutlak
 *    URL döner → frontend doğrudan <img src> ile yükler, statik servis gerekmez.
 *  - "gemini": Google Gemini 2.5 Flash Image, GEMINI_API_KEY gerektirir. Base64 →
 *    diske yazar (public/generated). NOT: Gemini'yi açmak için backend'de /generated
 *    statik servisi + vite proxy gerekir (demo'da Pollinations yeterli).
 *
 * Seçim env ile: IMAGE_PROVIDER=gemini
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface GenerateImageOptions {
  prompt: string;
  width?: number;
  height?: number;
  /** Sabit seed → aynı prompt+seed = aynı görsel. Verilmezse prompt'tan türetilir. */
  seed?: number;
}

export interface GeneratedImage {
  url: string;
  seed: number;
  provider: string;
  prompt: string;
}

export interface ImageProvider {
  readonly name: string;
  generate(opts: GenerateImageOptions): Promise<GeneratedImage>;
}

/** Kalite/maliyet dengesi. */
const DEFAULT_SIZE = 1280;

/** Gemini gibi base64 dönen provider'lar için yerel cache klasörü. */
const GENERATED_DIR = path.join(process.cwd(), 'public', 'generated');

// ============================================================================
// Pollinations — anahtarsız, URL-bazlı
// ============================================================================

const POLLINATIONS_IMAGE_BASE = 'https://image.pollinations.ai/prompt';

class PollinationsProvider implements ImageProvider {
  readonly name = 'pollinations';

  async generate(opts: GenerateImageOptions): Promise<GeneratedImage> {
    const width = opts.width ?? DEFAULT_SIZE;
    const height = opts.height ?? DEFAULT_SIZE;
    const seed = opts.seed ?? deterministicSeed(opts.prompt);

    const params = new URLSearchParams({
      width: String(width),
      height: String(height),
      seed: String(seed),
      nologo: 'true',
      enhance: 'false',
      model: 'flux',
      referrer: 'kuveytturk-ai-lab',
    });

    const url = `${POLLINATIONS_IMAGE_BASE}/${encodeURIComponent(opts.prompt)}?${params.toString()}`;
    return { url, seed, provider: this.name, prompt: opts.prompt };
  }
}

// ============================================================================
// Gemini 2.5 Flash Image — base64 → disk
// ============================================================================

const GEMINI_MODEL = 'gemini-2.5-flash-image-preview';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

class GeminiProvider implements ImageProvider {
  readonly name = 'gemini';

  async generate(opts: GenerateImageOptions): Promise<GeneratedImage> {
    const seed = opts.seed ?? deterministicSeed(opts.prompt);
    const filename = `${seed}.png`;
    const filepath = path.join(GENERATED_DIR, filename);
    const publicUrl = `/generated/${filename}`;

    if (existsSync(filepath)) {
      return { url: publicUrl, seed, provider: this.name, prompt: opts.prompt };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY bulunamadı (.env). Pollinations kullanın ya da anahtar ekleyin.');
    }

    const apiUrl = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: opts.prompt }] }] }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Gemini API hata ${res.status}: ${errorBody.substring(0, 300)}`);
    }

    const data = (await res.json()) as GeminiResponse;
    if (data.promptFeedback?.blockReason) {
      throw new Error(`Gemini prompt'u reddetti: ${data.promptFeedback.blockReason}`);
    }

    const imagePart = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      const finishReason = data.candidates?.[0]?.finishReason ?? 'bilinmiyor';
      throw new Error(`Gemini görsel döndürmedi (finishReason: ${finishReason})`);
    }

    await mkdir(GENERATED_DIR, { recursive: true });
    await writeFile(filepath, Buffer.from(imagePart.inlineData.data, 'base64'));
    return { url: publicUrl, seed, provider: this.name, prompt: opts.prompt };
  }
}

// ============================================================================
// Provider seçici
// ============================================================================

let _provider: ImageProvider | null = null;

export function getImageProvider(): ImageProvider {
  if (_provider) return _provider;

  const choice = (process.env.IMAGE_PROVIDER ?? 'pollinations').toLowerCase();
  switch (choice) {
    case 'pollinations':
      _provider = new PollinationsProvider();
      break;
    case 'gemini':
      _provider = new GeminiProvider();
      break;
    default:
      console.warn(`[image-gen] Bilinmeyen provider '${choice}', Pollinations'a düşülüyor.`);
      _provider = new PollinationsProvider();
  }
  console.log(`[image-gen] Active provider: ${_provider.name}`);
  return _provider;
}

// ============================================================================
// Helpers
// ============================================================================

/** Aynı prompt → aynı seed (cache hit). djb2 varyantı. */
export function deterministicSeed(prompt: string): number {
  let h = 0;
  for (let i = 0; i < prompt.length; i++) {
    h = (h * 31 + prompt.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Variant için yeni seed — aynı prompt, farklı seed → farklı görsel. */
export function variantSeed(prompt: string, variantIndex: number): number {
  const base = deterministicSeed(prompt);
  return Math.abs((base ^ (variantIndex * 2654435761)) | 0);
}
