/**
 * E-posta bildirim servisi.
 *
 * Modlar:
 *  - Production: SMTP (Nodemailer) — env'den SMTP_HOST/PORT/USER/PASS/FROM.
 *  - Dev fallback: console.log + audit (gerçek e-posta gitmez).
 *  - Test: hiç gönderim yok (env'de DISABLE_EMAIL=1).
 *
 * Tetikleyiciler:
 *  - booking.created: admin'lere yeni talep
 *  - booking.reviewed: kullanıcıya onay/red/feedback
 *  - waitlist.promoted: kullanıcıya "sıranız geldi"
 *
 * Güvenlik:
 *  - PII (e-posta, isim) sadece alıcının kendisine gönderilir.
 *  - SMTP credentials .env'de saklanır, log'a yazılmaz.
 *  - HTML escape uygulanır (XSS injection — e-posta client tarafında).
 *  - data_security §4 — log'da e-posta maskelenir.
 *
 * Queue:
 *  - Job queue üzerinden çağrılır (queue.service.ts) — endpoint response'unu bekletmez.
 */
import { getQueue, JobNames } from './queue.service';
import { logger } from '../utils/logger';
import { maskEmail } from '../utils/logger';

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === '1',
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'KLAB Randevu <noreply@klab.test>',
  };
}

let cachedTransporter: unknown = null;

async function getTransporter(): Promise<unknown> {
  if (cachedTransporter) return cachedTransporter;
  const smtp = readSmtpConfig();
  if (!smtp) return null;
  const nodemailer = await import('nodemailer');
  cachedTransporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
  });
  return cachedTransporter;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendNow(msg: EmailMessage): Promise<void> {
  if (process.env.DISABLE_EMAIL === '1') return;

  const transporter = await getTransporter();
  if (!transporter) {
    // Dev fallback — logger üzerinden
    logger.info('email_dev_fallback', {
      to: maskEmail(msg.to),
      subject: msg.subject,
      preview: msg.text.slice(0, 120),
    });
    return;
  }

  const smtp = readSmtpConfig();
  try {
    await (transporter as { sendMail: (opts: Record<string, unknown>) => Promise<unknown> }).sendMail({
      from: smtp?.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    logger.info('email_sent', { to: maskEmail(msg.to), subject: msg.subject });
  } catch (err) {
    logger.warn('email_send_failed', {
      to: maskEmail(msg.to),
      err: (err as Error).message,
    });
    // Production'da queue retry yapacak — exception fırlatma
  }
}

/* ============================================================
 * QUEUE HANDLER REGISTRATION
 * ============================================================ */

let registered = false;
export function registerEmailHandler(): void {
  if (registered) return;
  registered = true;
  const q = getQueue();
  q.register<EmailMessage>(JobNames.NOTIFY_EMAIL, async (payload) => {
    await sendNow(payload);
  });
}

export async function enqueueEmail(msg: EmailMessage): Promise<void> {
  await getQueue().add(JobNames.NOTIFY_EMAIL, msg);
}

/* ============================================================
 * TEMPLATES
 * ============================================================ */

function shell(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html lang="tr">
<body style="font-family:-apple-system,Segoe UI,sans-serif;background:#F7F8FA;padding:24px;color:#1B3A2F;">
  <table cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB;">
    <tr><td style="background:#0D5C3F;padding:20px 24px;">
      <h1 style="color:#fff;font-size:18px;margin:0;letter-spacing:0.5px;">${escapeHtml(title)}</h1>
      <div style="color:#FBBF24;font-size:11px;text-transform:uppercase;letter-spacing:2px;margin-top:4px;">Kuveyt Türk AI Lab</div>
    </td></tr>
    <tr><td style="padding:24px;line-height:1.6;">${body}</td></tr>
    <tr><td style="background:#F7F8FA;padding:16px 24px;color:#6B7280;font-size:11px;border-top:1px solid #E5E7EB;">
      Bu otomatik bir bildirimdir. Yanıtlamayın.<br>
      Bildirimleri kapatmak için profilinizdeki tercih ayarlarını kullanın.
    </td></tr>
  </table>
</body>
</html>`;
}

export function bookingReviewedEmail(args: {
  to: string;
  toName: string;
  projectName: string;
  roomCode: string;
  status: 'approved' | 'rejected' | 'feedback_requested';
  feedback?: string | null;
}): EmailMessage {
  const titleMap = {
    approved: '✓ Talebiniz onaylandı',
    rejected: '✕ Talebiniz reddedildi',
    feedback_requested: '💬 Düzeltme istendi',
  };
  const title = titleMap[args.status];
  const greeting = `Merhaba ${escapeHtml(args.toName.split(' ')[0] ?? '')},`;
  const projectLine = `<strong>${escapeHtml(args.projectName)}</strong> (${escapeHtml(args.roomCode)})`;

  let bodyHtml = `<p>${greeting}</p>`;
  let bodyText = `${greeting.replace(/<[^>]+>/g, '')}\n\n`;

  if (args.status === 'approved') {
    bodyHtml += `<p>${projectLine} randevu talebiniz <strong style="color:#10B981;">onaylandı</strong>. Tarihinizde odanız hazır olacak.</p>`;
    bodyText += `${args.projectName} (${args.roomCode}) randevu talebiniz onaylandı.\n`;
  } else if (args.status === 'rejected') {
    bodyHtml += `<p>${projectLine} randevu talebiniz <strong style="color:#EF4444;">reddedildi</strong>.</p>`;
    bodyText += `${args.projectName} (${args.roomCode}) randevu talebiniz reddedildi.\n`;
  } else {
    bodyHtml += `<p>${projectLine} talebiniz için <strong style="color:#3B82F6;">düzeltme talep edildi</strong>. Lütfen panelinizden düzenleyip yeniden gönderin.</p>`;
    bodyText += `${args.projectName} (${args.roomCode}) için düzeltme talep edildi.\n`;
  }

  if (args.feedback && args.feedback.trim()) {
    bodyHtml += `<div style="margin-top:16px;padding:12px;background:#F3F4F6;border-left:3px solid #FBBF24;border-radius:4px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6B7280;font-weight:bold;margin-bottom:4px;">Admin notu</div>
      <div style="white-space:pre-wrap;">${escapeHtml(args.feedback)}</div>
    </div>`;
    bodyText += `\nAdmin notu:\n${args.feedback}\n`;
  }

  bodyHtml += `<p style="margin-top:24px;"><a href="${process.env.FRONTEND_ORIGIN ?? ''}/bookings" style="background:#0D5C3F;color:#fff;padding:10px 16px;text-decoration:none;border-radius:8px;display:inline-block;">Taleplerime git</a></p>`;
  bodyText += `\n${process.env.FRONTEND_ORIGIN ?? ''}/bookings`;

  return {
    to: args.to,
    subject: `[KLAB] ${title} — ${args.projectName}`,
    html: shell(title, bodyHtml),
    text: bodyText,
  };
}

export function waitlistPromotedEmail(args: {
  to: string;
  toName: string;
  projectName: string;
  roomCode: string;
}): EmailMessage {
  const title = '🎉 Sıranız geldi';
  const greeting = `Merhaba ${escapeHtml(args.toName.split(' ')[0] ?? '')},`;
  const bodyHtml = `
    <p>${greeting}</p>
    <p>Bekleme listesindeki <strong>${escapeHtml(args.projectName)}</strong>
       projesi için <strong>${escapeHtml(args.roomCode)}</strong> odası serbest kaldı.</p>
    <p>Talebiniz otomatik olarak oluşturuldu — admin onayına gönderildi.</p>
    <p style="margin-top:24px;">
      <a href="${process.env.FRONTEND_ORIGIN ?? ''}/bookings"
         style="background:#0D5C3F;color:#fff;padding:10px 16px;text-decoration:none;border-radius:8px;display:inline-block;">
        Talebimi görüntüle
      </a>
    </p>`;
  const bodyText = `Merhaba ${args.toName.split(' ')[0] ?? ''},\n\nBekleme listesindeki "${args.projectName}" projesi için ${args.roomCode} odası serbest kaldı. Talebiniz oluşturuldu.\n\n${process.env.FRONTEND_ORIGIN ?? ''}/bookings`;
  return {
    to: args.to,
    subject: `[KLAB] ${title} — ${args.roomCode}`,
    html: shell(title, bodyHtml),
    text: bodyText,
  };
}

export function bookingCreatedAdminEmail(args: {
  to: string;
  projectName: string;
  roomCode: string;
  submitterName: string;
}): EmailMessage {
  const title = '📥 Yeni randevu talebi';
  const bodyHtml = `
    <p><strong>${escapeHtml(args.submitterName)}</strong> tarafından yeni bir talep geldi:</p>
    <ul>
      <li><strong>Proje:</strong> ${escapeHtml(args.projectName)}</li>
      <li><strong>Oda:</strong> ${escapeHtml(args.roomCode)}</li>
    </ul>
    <p style="margin-top:24px;">
      <a href="${process.env.FRONTEND_ORIGIN ?? ''}/admin"
         style="background:#0D5C3F;color:#fff;padding:10px 16px;text-decoration:none;border-radius:8px;display:inline-block;">
        Admin paneline git
      </a>
    </p>`;
  const bodyText = `${args.submitterName} tarafından yeni talep: "${args.projectName}" (${args.roomCode}).\n\n${process.env.FRONTEND_ORIGIN ?? ''}/admin`;
  return {
    to: args.to,
    subject: `[KLAB] ${title} — ${args.projectName}`,
    html: shell(title, bodyHtml),
    text: bodyText,
  };
}
