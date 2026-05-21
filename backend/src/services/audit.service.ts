/**
 * Audit log servisi.
 * app_security.md §8: Auth denemeleri, yetki hataları, kritik işlemler loglanır.
 */
import { nanoid } from 'nanoid';
import { getDb } from '../db/schema';
import { logger } from '../utils/logger';

export type AuditEventType =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.login.locked'
  | 'auth.refresh.success'
  | 'auth.refresh.failure'
  | 'auth.refresh.reuse_detected'
  | 'auth.logout'
  | 'auth.mfa.enroll'
  | 'auth.mfa.verify.success'
  | 'auth.mfa.verify.failure'
  | 'auth.mfa.disabled'
  | 'authz.denied'
  | 'validation.failure'
  | 'booking.created'
  | 'booking.updated'
  | 'booking.withdrawn'
  | 'booking.reviewed'
  | 'waitlist.joined'
  | 'waitlist.left'
  | 'waitlist.promoted'
  | 'waitlist.reordered'
  | 'booking.reassigned'
  | 'booking.user_reassigned'
  | 'booking.admin_deleted'
  | 'appointment.created'
  | 'appointment.cancelled'
  | 'admin.password_reset'
  | 'admin.password_changed'
  | 'user.update'
  | 'user.delete'
  | 'user.restore'
  | 'user.photo_uploaded'
  | 'message.sent'
  | 'showcase.liked'
  | 'showcase.commented'
  | 'license_request.created'
  | 'license_request.updated'
  | 'license_request.reviewed'
  | 'password_reset.requested'
  | 'password_reset.completed'
  | 'rate_limit.exceeded'
  | 'csrf.failure';

export type SubjectType = 'user' | 'admin' | 'danisman' | 'arge' | 'anonymous';

export interface AuditEvent {
  eventType: AuditEventType;
  subjectId?: string | null;
  subjectType?: SubjectType;
  ipAddress?: string | null;
  userAgent?: string | null;
  success: boolean;
  details?: Record<string, unknown>;
}

const SENSITIVE_DETAIL_KEYS = ['password', 'token', 'secret', 'authorization'];

function sanitizeDetails(details?: Record<string, unknown>): string | null {
  if (!details) return null;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    const lower = key.toLowerCase();
    if (SENSITIVE_DETAIL_KEYS.some((s) => lower.includes(s))) {
      cleaned[key] = '[REDACTED]';
    } else {
      cleaned[key] = value;
    }
  }
  return JSON.stringify(cleaned);
}

export function recordAudit(event: AuditEvent): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_logs (id, event_type, subject_id, subject_type, ip_address, user_agent, success, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      nanoid(),
      event.eventType,
      event.subjectId ?? null,
      event.subjectType ?? 'anonymous',
      event.ipAddress ?? null,
      event.userAgent ?? null,
      event.success ? 1 : 0,
      sanitizeDetails(event.details)
    );

    logger.info('audit', {
      event_type: event.eventType,
      subject_type: event.subjectType,
      success: event.success,
    });
  } catch (err) {
    logger.error('audit_write_failed', { err: (err as Error).message });
  }
}
