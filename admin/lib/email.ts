import { Resend } from 'resend';

/**
 * Email transport with three providers, tried in order:
 *   1. Resend (RESEND_API_KEY) - fastest path, recommended
 *   2. Generic SMTP via nodemailer (SMTP_HOST + SMTP_USER + SMTP_PASS) - for
 *      free providers like Brevo (smtp-relay.brevo.com:587, 300/day free),
 *      SendGrid (smtp.sendgrid.net:587, 100/day free), Mailgun, or Gmail SMTP.
 *   3. No-op + log warning - local dev or unconfigured deploys.
 *
 * Each provider is tried and the first success wins. If both API_KEY and
 * SMTP_* are set, Resend is preferred. Never throws - callers can treat
 * sendEmail as fire-and-forget.
 */

const DEFAULT_FROM =
  'Realtor Portal <noreply@parallelstudios.co>';

export type EmailAttachment = {
  filename: string;
  content: Buffer | string;
  // application/octet-stream, text/calendar, etc. The Resend SDK forwards
  // this verbatim in the multipart body.
  contentType?: string;
};

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  // Optional override; otherwise RESEND_FROM / DEFAULT_FROM is used.
  from?: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id: string | null; skipped?: false }
  | { ok: false; skipped: true; reason: 'no_api_key' }
  | { ok: false; skipped?: false; error: string };

let warnedNoKey = false;
let cachedClient: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (!warnedNoKey) {
      // Log once per process - this is expected in local dev where the key
      // isn't set, and we don't want to spam every fire-and-forget call.
      // eslint-disable-next-line no-console
      console.warn(
        '[email] RESEND_API_KEY is not set - sendEmail() will no-op. ' +
          'Set RESEND_API_KEY (and optionally RESEND_FROM) in Vercel to enable.'
      );
      warnedNoKey = true;
    }
    return null;
  }
  if (!cachedClient) cachedClient = new Resend(key);
  return cachedClient;
}

async function sendViaSmtp(
  input: SendEmailInput,
  from: string
): Promise<SendEmailResult | null> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  try {
    // Dynamic import so nodemailer is only loaded when actually used.
    const nodemailer = await import('nodemailer');
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure =
      process.env.SMTP_SECURE === 'true' || port === 465;
    const transporter = (nodemailer as any).createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    const info = await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return { ok: true, id: info?.messageId ?? null };
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[email] SMTP send failed', err?.message || err);
    return { ok: false, error: err?.message || 'SMTP send failed' };
  }
}

/**
 * Send a transactional email. Returns a result object - never throws.
 *
 * Provider priority:
 *   1. Resend (if RESEND_API_KEY set)
 *   2. SMTP fallback (if SMTP_HOST + SMTP_USER + SMTP_PASS set)
 *   3. No-op with warning log
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const from = input.from || process.env.RESEND_FROM || DEFAULT_FROM;

  // Resend requires either html or text. If both are empty, surface an
  // error rather than silently dropping.
  if (!input.html && !input.text) {
    return { ok: false, error: 'sendEmail: html or text is required' };
  }

  const client = getClient();
  if (client) {
    try {
      const { data, error } = await client.emails.send({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments?.map((a) => ({
          filename: a.filename,
          content:
            typeof a.content === 'string'
              ? a.content
              : a.content.toString('base64'),
          contentType: a.contentType,
        })),
        replyTo: input.replyTo,
      } as any);

      if (error) {
        // Resend rejected (likely domain-not-verified). Fall through to SMTP
        // if it's configured.
        // eslint-disable-next-line no-console
        console.error('[email] Resend rejected', error.message || error);
      } else {
        return { ok: true, id: data?.id ?? null };
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[email] Resend threw', err?.message || err);
    }
  }

  // Try SMTP fallback. Returns null only if SMTP vars aren't set.
  const smtpResult = await sendViaSmtp(input, from);
  if (smtpResult) return smtpResult;

  // No provider configured at all.
  return { ok: false, skipped: true, reason: 'no_api_key' };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
