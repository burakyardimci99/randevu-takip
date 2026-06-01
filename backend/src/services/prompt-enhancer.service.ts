/**
 * Türkçe kullanıcı fikrini, image-generation modeline uygun zenginleştirilmiş
 * bir İngilizce prompt'a çevirir. (gorsel_uretim projesinden port — Express).
 *
 * Pollinations text endpoint kullanır (anahtarsız, ücretsiz):
 *   GET https://text.pollinations.ai/{prompt}
 *
 * İmza sabit: (input) => Promise<string>. İleride Together/Groq/Claude'a swap edilebilir.
 */

const POLLINATIONS_TEXT_BASE = 'https://text.pollinations.ai';

const SYSTEM_PROMPT = `You are an expert visual art director for an AI laboratory's screen display. Your job: take a user's project idea (in Turkish or English) and produce ONE detailed English image-generation prompt that represents the idea visually.

OUTPUT RULES:
- Output ONLY the final image prompt — no preamble, no quotes, no explanation, no markdown.
- 45-75 words, single paragraph.
- Always include: clear subject, environment/setting, art style, color palette, mood/lighting, composition, and quality cues.
- End with quality boosters: "highly detailed, professional composition, cinematic lighting, 8k, masterpiece".

STYLE DEFAULTS (use when user gives no theme):
- Modern futuristic tech aesthetic
- Isometric 3D illustration OR holographic UI mockup OR cinematic concept art
- Deep navy background with cyan and electric blue neon accents
- Subtle neon glow, soft scanlines, depth of field

USER THEME OVERRIDE:
- If the user provides a "Görsel Tarz/Tema" (visual theme/style), honor it strictly and let it override the style defaults above.
- Examples of valid themes: "watercolor pastel", "cyberpunk neon", "corporate clean blue-white", "Studio Ghibli warm", "vaporwave purple", "minimal monochrome".
- Translate Turkish theme descriptions to English if needed.

FORBIDDEN:
- No text/letters/numbers visible in the image (image models render them poorly).
- No close-up human faces (use silhouettes, back views, or abstract figures).
- No unsafe content, no copyrighted characters.`;

export interface EnhanceOptions {
  fikir: string;
  tema?: string;
  departman?: string;
  signal?: AbortSignal;
}

export async function enhancePrompt({
  fikir,
  tema,
  departman,
  signal,
}: EnhanceOptions): Promise<string> {
  const userInput = [
    departman && `Departman: ${departman}`,
    `Fikir: ${fikir}`,
    tema && tema.trim() && `Görsel Tarz/Tema: ${tema.trim()}`,
  ]
    .filter(Boolean)
    .join('\n');

  const fullPrompt = `${SYSTEM_PROMPT}\n\n---\nUser input:\n${userInput}\n\nImage prompt:`;
  const url = `${POLLINATIONS_TEXT_BASE}/${encodeURIComponent(fullPrompt)}`;

  try {
    // Pollinations text yavaş/çökükse 8sn sonra iptal → yerel fallback prompt'a düş.
    const res = await fetch(url, {
      method: 'GET',
      signal: signal ?? AbortSignal.timeout(8000),
      headers: { Accept: 'text/plain' },
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Pollinations text API hata: ${res.status} ${res.statusText}`);
    }

    const text = (await res.text()).trim();
    if (!text || text.length < 10) {
      return buildFallbackPrompt(fikir, tema);
    }

    // Bazı modeller çıktıyı tırnak içine alır — temizle.
    return text.replace(/^["'`]+|["'`]+$/g, '').trim();
  } catch (err) {
    console.warn('[prompt-enhancer] Pollinations failed, using fallback:', err);
    return buildFallbackPrompt(fikir, tema);
  }
}

function buildFallbackPrompt(fikir: string, tema?: string): string {
  const themeClause = tema?.trim()
    ? `${tema.trim()}, `
    : `deep navy background with cyan and electric blue neon accents, holographic UI elements, soft neon glow, `;
  return (
    `Modern isometric 3D illustration of "${fikir}", futuristic tech concept, ` +
    themeClause +
    `cinematic lighting, clean composition, depth of field, ` +
    `highly detailed, professional, 8k, masterpiece, no text`
  );
}
