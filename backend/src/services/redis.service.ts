/**
 * Redis adapter — opt-in via REDIS_URL env var.
 *
 * Kullanım alanları:
 *  - Rate limit shared state (multi-instance)
 *  - SSE pub/sub (multi-instance broadcast)
 *  - Cache (analytics, session, etc.)
 *  - BullMQ backend (queue.service.ts)
 *
 * Default (REDIS_URL set değil):
 *  - rate-limit: in-memory (mevcut)
 *  - SSE: tek-instance lokal Map (mevcut)
 *  - Cache: in-memory Map
 *  - Queue: in-memory FIFO (queue.service.ts)
 *
 * Production'da:
 *  - REDIS_URL=redis://... set edilir + `npm i ioredis`
 *  - Tüm in-memory state otomatik Redis backed olur
 *
 * NOT: ioredis dinamik import — paket yoksa hata fırlatmaz, default fallback'lere düşer.
 */
import { logger } from '../utils/logger';

export function isRedisConfigured(): boolean {
  return !!process.env.REDIS_URL && process.env.REDIS_URL.startsWith('redis');
}

interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

/** In-memory fallback cache (multi-instance safe DEĞIL — sadece dev). */
class MemoryCache implements CacheClient {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}

let cachedClient: CacheClient | null = null;

export async function getCache(): Promise<CacheClient> {
  if (cachedClient) return cachedClient;

  if (!isRedisConfigured()) {
    cachedClient = new MemoryCache();
    logger.info('cache_using_memory_fallback');
    return cachedClient;
  }

  // ioredis dinamik import (opsiyonel paket)
  try {
    const ioredisModule = (await import('ioredis' as string)) as {
      default?: new (url: string) => { get: (k: string) => Promise<string | null>; set: (...args: unknown[]) => Promise<unknown>; del: (k: string) => Promise<unknown>; call: (...args: string[]) => Promise<unknown> };
    };
    const RedisCtor = ioredisModule.default ?? (ioredisModule as unknown as new (url: string) => never);
    const redis = new (RedisCtor as new (url: string) => { get: (k: string) => Promise<string | null>; set: (...args: unknown[]) => Promise<unknown>; del: (k: string) => Promise<unknown> })(process.env.REDIS_URL!);
    cachedClient = {
      async get(key: string) {
        return redis.get(key);
      },
      async set(key: string, value: string, ttlSeconds?: number) {
        if (ttlSeconds) {
          await redis.set(key, value, 'EX', ttlSeconds);
        } else {
          await redis.set(key, value);
        }
      },
      async del(key: string) {
        await redis.del(key);
      },
    };
    logger.info('cache_using_redis', { url_prefix: process.env.REDIS_URL?.slice(0, 12) });
    return cachedClient;
  } catch (err) {
    logger.warn('redis_unavailable_using_memory', { err: (err as Error).message });
    cachedClient = new MemoryCache();
    return cachedClient;
  }
}

/**
 * Rate-limit store helper.
 * express-rate-limit ile entegrasyon için `rate-limit-redis` paketi kullanılır.
 * Default: in-memory (express-rate-limit default).
 */
export async function maybeBuildRateLimitStore(): Promise<unknown | undefined> {
  if (!isRedisConfigured()) return undefined;
  try {
    type Ctor = new (url: string) => { call: (...args: string[]) => Promise<unknown> };
    const rlMod = (await import('rate-limit-redis' as string).catch(() => ({ default: null }))) as { default: (new (cfg: Record<string, unknown>) => unknown) | null };
    const ioMod = (await import('ioredis' as string).catch(() => null)) as { default?: Ctor } | Ctor | null;
    if (!rlMod.default || !ioMod) {
      logger.warn('rate_limit_redis_packages_missing');
      return undefined;
    }
    const RedisStore = rlMod.default;
    const RedisCtor: Ctor = (ioMod as { default?: Ctor }).default ?? (ioMod as Ctor);
    const client = new RedisCtor(process.env.REDIS_URL!);
    return new RedisStore({
      sendCommand: (...args: string[]) => client.call(...args),
    });
  } catch (err) {
    logger.warn('rate_limit_redis_setup_failed', { err: (err as Error).message });
    return undefined;
  }
}
