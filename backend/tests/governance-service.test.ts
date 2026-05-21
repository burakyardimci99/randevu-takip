/**
 * Yönetişim yaşam döngüsü — durum makinesi testleri.
 *
 * Test alanı:
 *  - Otomatik red (gerçek veri beyanı)
 *  - Başvuru onayı → 'development' geçişi + kalite kapısı oluşumu
 *  - SWAT yönlendirme
 *  - Kapı geçiş kapısı: kapılar yeşil olmadan stage'e geçilemez
 *  - İnsan onayı: stage/production onayı olmadan ilerlenemez
 *  - Proje türü yükseltme (PoC → Kuruma Entegre)
 *  - SLA hesabı
 */
process.env.DISABLE_EMAIL = '1';
import './setup-env';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import { nanoid } from 'nanoid';
import { initSchema, closeDb, getDb } from '../src/db/schema';
import {
  createLicenseRequest,
  reviewLicenseRequest,
  type CreateLicenseRequestInput,
} from '../src/services/license-request.service';
import {
  advanceLifecycle,
  computeSla,
  upgradeProjectType,
  listStageEvents,
} from '../src/services/governance.service';
import {
  listGatesForRequest,
  setGateResult,
  allGatesPassed,
} from '../src/services/quality-gate.service';
import {
  decideApproval,
  getPendingApproval,
} from '../src/services/human-approval.service';
import { HttpError } from '../src/middleware/error.middleware';

const USER = nanoid();
const ADMIN = nanoid();

beforeAll(async () => {
  initSchema();
  const db = getDb();
  const hash = await argon2.hash('Demo1234!Pass', { type: argon2.argon2id });
  db.prepare(`INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)`).run(
    USER, 'gov-user@test.local', hash, 'Gov User'
  );
  db.prepare(`INSERT INTO admins (id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)`).run(
    ADMIN, 'gov-admin@test.local', hash, 'Gov Admin', 'super_admin'
  );
});

afterAll(() => {
  closeDb();
});

function input(overrides: Partial<CreateLicenseRequestInput> = {}): CreateLicenseRequestInput {
  return {
    requestTitle: 'Yönetişim Test Projesi',
    reason: 'Yönetişim yaşam döngüsünü uçtan uca test etmek için.',
    expectedBenefit: 'Süreç doğruluğunun otomatik testlerle güvence altına alınması.',
    successCriteria: 'Tüm aşama geçişleri ve kapılar beklendiği gibi çalışmalı.',
    items: [{ licenseKey: 'custom', licenseName: 'Test Aracı', vendor: null, category: null }],
    projectType: 'poc',
    estimatedDurationDays: 30,
    dataToUse: 'Sentetik test verisi.',
    technicalStack: 'Python',
    durationMonths: 3,
    usesExternalApi: false,
    involvesRealData: false,
    ...overrides,
  };
}

/** Tüm uygulanabilir kapıları 'passed' yapar. */
function passAllGates(requestId: string): void {
  for (const g of listGatesForRequest(requestId)) {
    setGateResult(requestId, g.gateKey, { status: 'passed', score: 95 });
  }
}

describe('otomatik red — gerçek veri beyanı', () => {
  it('involvesRealData=true → başvuru otomatik reddedilir', () => {
    const r = createLicenseRequest(USER, input({ involvesRealData: true }));
    expect(r.status).toBe('rejected');
    expect(r.adminFeedback).toContain('Otomatik red');
    expect(r.lifecycleStage).toBe('application');
  });

  it('involvesRealData=false → normal pending başvuru', () => {
    const r = createLicenseRequest(USER, input());
    expect(r.status).toBe('pending');
    expect(r.lifecycleStage).toBe('application');
    expect(r.governanceLevel).toBe('basic'); // poc
  });

  it('projectType=integration → governance_level full', () => {
    const r = createLicenseRequest(USER, input({ projectType: 'integration' }));
    expect(r.governanceLevel).toBe('full');
  });
});

describe('başvuru onayı → development', () => {
  it('approve → lifecycle development + kalite kapıları oluşur', () => {
    const created = createLicenseRequest(USER, input());
    reviewLicenseRequest(ADMIN, created.id, { action: 'approve' });
    const gates = listGatesForRequest(created.id);
    // basic seviye → 3 kapı (build, code_review, security)
    expect(gates.length).toBe(3);
    expect(gates.every((g) => g.status === 'pending')).toBe(true);
    const events = listStageEvents(created.id);
    expect(events.some((e) => e.toStage === 'development')).toBe(true);
  });

  it('full seviye onayı → 5 kapı oluşur', () => {
    const created = createLicenseRequest(USER, input({ projectType: 'integration' }));
    reviewLicenseRequest(ADMIN, created.id, { action: 'approve' });
    expect(listGatesForRequest(created.id).length).toBe(5);
  });
});

describe('SWAT yönlendirme', () => {
  it('swat aksiyonu → review_track swat, status pending kalır', () => {
    const created = createLicenseRequest(USER, input());
    const result = reviewLicenseRequest(ADMIN, created.id, {
      action: 'swat',
      adminFeedback: 'Yüksek karmaşıklık.',
    });
    expect(result.reviewTrack).toBe('swat');
    expect(result.status).toBe('pending');
  });
});

describe('yaşam döngüsü geçiş kapıları', () => {
  it('kapılar yeşil olmadan development → stage engellenir', () => {
    const created = createLicenseRequest(USER, input());
    reviewLicenseRequest(ADMIN, created.id, { action: 'approve' });
    try {
      advanceLifecycle(created.id, ADMIN);
      throw new Error('beklenmeyen: hata fırlatmadı');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).code).toBe('GATES_NOT_PASSED');
    }
  });

  it('tüm kapılar yeşil → development → stage + bekleyen stage onayı', () => {
    const created = createLicenseRequest(USER, input());
    reviewLicenseRequest(ADMIN, created.id, { action: 'approve' });
    passAllGates(created.id);
    expect(allGatesPassed(created.id, 'basic')).toBe(true);
    const res = advanceLifecycle(created.id, ADMIN);
    expect(res.toStage).toBe('stage');
    expect(getPendingApproval(created.id, 'stage')).toBeTruthy();
  });

  it('stage onayı olmadan stage → production engellenir', () => {
    const created = createLicenseRequest(USER, input());
    reviewLicenseRequest(ADMIN, created.id, { action: 'approve' });
    passAllGates(created.id);
    advanceLifecycle(created.id, ADMIN); // → stage
    try {
      advanceLifecycle(created.id, ADMIN); // stage → production
      throw new Error('beklenmeyen: hata fırlatmadı');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).code).toBe('STAGE_APPROVAL_REQUIRED');
    }
  });

  it('tam akış: development → stage → production → live', () => {
    const created = createLicenseRequest(USER, input());
    reviewLicenseRequest(ADMIN, created.id, { action: 'approve' });
    passAllGates(created.id);

    expect(advanceLifecycle(created.id, ADMIN).toStage).toBe('stage');
    decideApproval(created.id, 'stage', ADMIN, { decision: 'approved' });

    expect(advanceLifecycle(created.id, ADMIN).toStage).toBe('production');
    decideApproval(created.id, 'production', ADMIN, { decision: 'approved' });

    expect(advanceLifecycle(created.id, ADMIN).toStage).toBe('live');

    // Canlıdaki proje daha fazla ilerletilemez.
    try {
      advanceLifecycle(created.id, ADMIN);
      throw new Error('beklenmeyen: hata fırlatmadı');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).code).toBe('STAGE_NOT_ADVANCEABLE');
    }
  });
});

describe('proje türü yükseltme', () => {
  it('PoC → Kuruma Entegre: governance_level full + yeni kapılar', () => {
    const created = createLicenseRequest(USER, input({ projectType: 'poc' }));
    reviewLicenseRequest(ADMIN, created.id, { action: 'approve' });
    expect(listGatesForRequest(created.id).length).toBe(3); // basic

    upgradeProjectType(created.id, ADMIN);
    expect(listGatesForRequest(created.id).length).toBe(5); // full — mimari + framework eklendi
  });
});

describe('SLA hesabı', () => {
  it('bekleyen başvuru → aktif SLA bilgisi döner', () => {
    const created = createLicenseRequest(USER, input());
    const sla = computeSla({
      id: created.id,
      lifecycleStage: 'application',
      status: 'pending',
      reviewTrack: 'standard',
      createdAt: created.createdAt,
    });
    expect(sla).not.toBeNull();
    expect(sla!.checkpoint).toBe('Başvuru Değerlendirme');
    expect(sla!.slaHours).toBe(24);
  });

  it('SWAT başvurusu → 120 saatlik SLA', () => {
    const sla = computeSla({
      id: nanoid(),
      lifecycleStage: 'application',
      status: 'pending',
      reviewTrack: 'swat',
      createdAt: new Date().toISOString(),
    });
    expect(sla!.checkpoint).toBe('SWAT İnceleme');
    expect(sla!.slaHours).toBe(120);
  });
});
