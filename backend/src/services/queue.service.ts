/**
 * Background job queue — Redis varsa BullMQ, yoksa in-process fallback.
 *
 * Amaç:
 *  - E-posta gönderme, embedding hesaplama, audit batch write gibi
 *    asenkron işleri uygulama akışından ayırmak.
 *
 * Strateji:
 *  - Production: process.env.REDIS_URL set ise BullMQ Redis backend kullanılır.
 *  - Demo / development: in-process FIFO + setImmediate ile çalışan basit kuyruk.
 *
 * NOT: Demo'da Redis paketi require edilmez (dependency boyutu küçük tutulur).
 *      Production'a geçişte: `npm i bullmq ioredis` ve `BullMQAdapter` export edilir.
 */
import { logger } from '../utils/logger';

export type JobHandler<TPayload> = (payload: TPayload) => Promise<void> | void;

export interface QueueAdapter {
  add<TPayload>(name: string, payload: TPayload): Promise<void>;
  register<TPayload>(name: string, handler: JobHandler<TPayload>): void;
  pendingCount(): number;
  drain(): Promise<void>;
  shutdown(): Promise<void>;
}

interface InMemoryJob {
  name: string;
  payload: unknown;
  enqueuedAt: number;
  attempts: number;
}

class InMemoryQueue implements QueueAdapter {
  private readonly handlers = new Map<string, JobHandler<unknown>>();
  private readonly queue: InMemoryJob[] = [];
  private processing = false;
  private shuttingDown = false;

  add<TPayload>(name: string, payload: TPayload): Promise<void> {
    if (this.shuttingDown) {
      logger.warn('queue_add_during_shutdown', { name });
      return Promise.resolve();
    }
    this.queue.push({ name, payload, enqueuedAt: Date.now(), attempts: 0 });
    this.tick();
    return Promise.resolve();
  }

  register<TPayload>(name: string, handler: JobHandler<TPayload>): void {
    this.handlers.set(name, handler as JobHandler<unknown>);
  }

  pendingCount(): number {
    return this.queue.length;
  }

  async drain(): Promise<void> {
    // processing de beklenir: job shift() ile kuyruktan çıktıktan sonra handler
    // çalışırken length=0 olur — yalnız length'e bakmak uçuştaki job'u yarıda
    // kestiriyordu (shutdown'da e-posta/embedding kaybı).
    while (this.queue.length > 0 || this.processing) {
      await new Promise((r) => setImmediate(r));
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    await this.drain();
  }

  private tick(): void {
    if (this.processing) return;
    this.processing = true;
    setImmediate(async () => {
      try {
        while (this.queue.length > 0) {
          const job = this.queue.shift();
          if (!job) break;
          const handler = this.handlers.get(job.name);
          if (!handler) {
            logger.warn('queue_no_handler', { job: job.name });
            continue;
          }
          try {
            await handler(job.payload);
          } catch (err) {
            job.attempts++;
            if (job.attempts < 3) {
              // Backoff'lu retry: aynı tick döngüsünde anında tekrar denenirse
              // geçici hatalarda (SMTP/HF kısa kesinti) 3 hak <1sn'de tükeniyordu.
              const delayMs = job.attempts * 5_000;
              const timer = setTimeout(() => {
                if (this.shuttingDown) return;
                this.queue.push(job);
                this.tick();
              }, delayMs);
              timer.unref();
              logger.warn('queue_job_retry', {
                job: job.name,
                attempts: job.attempts,
                delayMs,
                err: (err as Error).message,
              });
            } else {
              logger.error('queue_job_dead', {
                job: job.name,
                attempts: job.attempts,
                err: (err as Error).message,
              });
            }
          }
        }
      } finally {
        this.processing = false;
      }
    });
  }
}

let instance: QueueAdapter | null = null;

export function getQueue(): QueueAdapter {
  if (!instance) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      // Production hook — BullMQ adapter buraya enjekte edilir.
      logger.info('queue_redis_detected_but_using_inmem', {
        note: 'BullMQ adapter henüz wire edilmedi; production geçişinde aktive edilecek.',
      });
    }
    instance = new InMemoryQueue();
    logger.info('queue_initialized', { type: 'in-memory' });
  }
  return instance;
}

/* ============================================================
 * STANDART JOB ADLARI
 * ============================================================ */
export const JobNames = {
  EMBED_BOOKING: 'embed_booking',
  NOTIFY_EMAIL: 'notify_email',
} as const;
