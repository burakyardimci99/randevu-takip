/**
 * Kalite kapısı servisi — 6 yönetişim ajanının kapı sonuçları.
 *
 * Her proje 'development' aşamasına girdiğinde, yönetişim seviyesine
 * uygun kapı satırları 'pending' olarak oluşturulur. Sonuçlar admin
 * veya CI pipeline tarafından güncellenir. Tüm uygulanabilir kapılar
 * 'passed' olmadan proje 'stage' aşamasına geçemez.
 */
import { nanoid } from 'nanoid';
import { getDb } from '../db/schema';
import {
  GATE_DEFINITIONS,
  applicableGates,
  type GateKey,
  type GovernanceLevel,
} from './governance-data';

export type GateStatus = 'pending' | 'passed' | 'failed';

export interface QualityGate {
  id: string;
  requestId: string;
  gateKey: GateKey;
  label: string;
  agent: string;
  threshold: number | null;
  thresholdUnit: string | null;
  referenceMd: string;
  status: GateStatus;
  score: number | null;
  detail: string | null;
  evaluatedAt: string | null;
}

interface GateRow {
  id: string;
  request_id: string;
  gate_key: GateKey;
  status: GateStatus;
  score: number | null;
  threshold: number | null;
  detail: string | null;
  evaluated_at: string | null;
}

function rowToGate(row: GateRow): QualityGate {
  const def = GATE_DEFINITIONS[row.gate_key];
  return {
    id: row.id,
    requestId: row.request_id,
    gateKey: row.gate_key,
    label: def?.label ?? row.gate_key,
    agent: def?.agent ?? '',
    threshold: row.threshold,
    thresholdUnit: def?.thresholdUnit ?? null,
    referenceMd: def?.referenceMd ?? '',
    status: row.status,
    score: row.score,
    detail: row.detail,
    evaluatedAt: row.evaluated_at,
  };
}

/**
 * Proje 'development' aşamasına girince uygulanabilir kapıları
 * 'pending' olarak oluşturur. Idempotent — var olan kapıya dokunmaz.
 */
export function initGatesForRequest(requestId: string, level: GovernanceLevel): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO quality_gates
       (id, request_id, gate_key, status, threshold)
     VALUES (?, ?, ?, 'pending', ?)`
  );
  const txn = db.transaction(() => {
    for (const key of applicableGates(level)) {
      insert.run(nanoid(), requestId, key, GATE_DEFINITIONS[key].threshold);
    }
  });
  txn();
}

export function listGatesForRequest(requestId: string): QualityGate[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM quality_gates WHERE request_id = ?')
    .all(requestId) as GateRow[];
  return sortGates(rows.map(rowToGate));
}

/** Birden çok talep için kapıları tek sorguda yükler. */
export function listGatesForRequests(requestIds: string[]): Map<string, QualityGate[]> {
  const map = new Map<string, QualityGate[]>();
  if (requestIds.length === 0) return map;
  const db = getDb();
  const placeholders = requestIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM quality_gates WHERE request_id IN (${placeholders})`)
    .all(...requestIds) as GateRow[];
  for (const r of rows) {
    const list = map.get(r.request_id) ?? [];
    list.push(rowToGate(r));
    map.set(r.request_id, list);
  }
  for (const [k, v] of map) map.set(k, sortGates(v));
  return map;
}

/** Kapıları tanım sırasına göre sıralar (build → security). */
function sortGates(gates: QualityGate[]): QualityGate[] {
  const order = Object.keys(GATE_DEFINITIONS) as GateKey[];
  return [...gates].sort((a, b) => order.indexOf(a.gateKey) - order.indexOf(b.gateKey));
}

export interface GateResultInput {
  status: GateStatus;
  score?: number | null;
  detail?: string | null;
}

/**
 * Bir kapının sonucunu günceller (admin / CI pipeline).
 * Kapı satırı yoksa oluşturur.
 */
export function setGateResult(
  requestId: string,
  gateKey: GateKey,
  input: GateResultInput
): QualityGate {
  const db = getDb();
  const def = GATE_DEFINITIONS[gateKey];
  const existing = db
    .prepare('SELECT id FROM quality_gates WHERE request_id = ? AND gate_key = ?')
    .get(requestId, gateKey) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE quality_gates SET
         status = ?, score = ?, detail = ?,
         evaluated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).run(input.status, input.score ?? null, input.detail?.trim() || null, existing.id);
  } else {
    db.prepare(
      `INSERT INTO quality_gates
         (id, request_id, gate_key, status, score, threshold, detail, evaluated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).run(
      nanoid(),
      requestId,
      gateKey,
      input.status,
      input.score ?? null,
      def?.threshold ?? null,
      input.detail?.trim() || null
    );
  }

  const row = db
    .prepare('SELECT * FROM quality_gates WHERE request_id = ? AND gate_key = ?')
    .get(requestId, gateKey) as GateRow;
  return rowToGate(row);
}

/**
 * Verilen yönetişim seviyesindeki TÜM uygulanabilir kapılar 'passed' mı?
 * (development → stage geçiş koşulu.)
 */
export function allGatesPassed(requestId: string, level: GovernanceLevel): boolean {
  const required = applicableGates(level);
  const gates = listGatesForRequest(requestId);
  return required.every(
    (key) => gates.find((g) => g.gateKey === key)?.status === 'passed'
  );
}
