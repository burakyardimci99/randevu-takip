/**
 * Background job queue (in-memory) — kayıt + enqueue + retry testleri.
 *
 * Kapsam:
 *  - handler kaydı + enqueue → job işlenir (drain ile beklenir)
 *  - getQueue() singleton döner (aynı instance)
 *  - başarısız job retry edilir (vitest fake timers ile backoff hızlandırılır)
 *
 * NOT: InMemoryQueue sınıfı export edilmiyor — public API getQueue() üzerinden
 * test edilir. DB gerektirmez (saf in-process kuyruk).
 */
import './setup-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getQueue, JobNames } from '../src/services/queue.service';

describe('getQueue singleton', () => {
  it('aynı instance döner', () => {
    const a = getQueue();
    const b = getQueue();
    expect(a).toBe(b);
  });

  it('standart job adları export edilir', () => {
    expect(JobNames.EMBED_BOOKING).toBe('embed_booking');
  });
});

describe('enqueue + handler', () => {
  it('kayıtlı handler enqueue edilen job ile çağrılır', async () => {
    const q = getQueue();
    const jobName = `test_job_${Date.now()}`;
    const received: unknown[] = [];

    q.register<{ value: number }>(jobName, (payload) => {
      received.push(payload);
    });

    await q.add(jobName, { value: 42 });
    await q.drain();

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ value: 42 });
  });

  it('birden çok job FIFO sırada işlenir', async () => {
    const q = getQueue();
    const jobName = `test_fifo_${Date.now()}`;
    const order: number[] = [];

    q.register<{ n: number }>(jobName, async (payload) => {
      await Promise.resolve();
      order.push(payload.n);
    });

    await q.add(jobName, { n: 1 });
    await q.add(jobName, { n: 2 });
    await q.add(jobName, { n: 3 });
    await q.drain();

    expect(order).toEqual([1, 2, 3]);
  });

  it('handler yoksa hata fırlatılmaz (sessizce atlanır)', async () => {
    const q = getQueue();
    await expect(q.add('no_such_handler_registered', { x: 1 })).resolves.toBeUndefined();
    await expect(q.drain()).resolves.toBeUndefined();
  });
});

describe('retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('başarısız job yeniden denenir ve sonunda başarılı olur', async () => {
    const q = getQueue();
    const jobName = `test_retry_${Date.now()}`;
    let attempts = 0;

    q.register<{ id: string }>(jobName, async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error('geçici hata');
      }
    });

    await q.add(jobName, { id: 'a' });
    // İlk deneme: setImmediate tick'i — başarısız (attempts=1), 5sn sonra retry planlanır.
    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toBe(1);

    // Backoff (attempts*5000 = 5000ms) ilerlet → retry kuyruğa girer + işlenir.
    await vi.advanceTimersByTimeAsync(6_000);
    expect(attempts).toBe(2);
  });
});
