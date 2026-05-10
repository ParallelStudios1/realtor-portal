import { Resend } from 'resend';

/**
 * Thin wrapper around the Resend SDK. Reads RESEND_API_KEY and RESEND_FROM
 * from the environment. If RESEND_API_KEY is unset we log a single warning
 * the first time anyone calls sendEmail() and then return a soft no-op
 * result on every call after — never throws.
 *
 * This lets every caller be fire-and-forget: the route handler doesn't need
 * to special-case "we haven't wired up Resend yet" in dev / preview.
 */

const DEFAULT_FROM =
  'Realtor Portal <noreply@realtor-portal-ten.vercel.app>';

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
      // Log once per process — this is expected in local dev where the key
      // isn't set, and we don't want to spam every fire-and-forget call.
      // eslint-disable-next-line no-console
      console.warn(
        '[email] RESEND_API_KEY is not set — sendEmail() will no-op. ' +
          'Set RESEND_API_KEY (and optionally RESEND_FROM) in Vercel to enable.'
      );
      warnedNoKey = true;
    }
    return null;
  }
  if (!cachedClient) cachedClient = new Resend(key);
  return cachedClient;
}

/**
 * Send a transactional email. Returns a result object — never throws.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getClient();
  if (!client) {
    return { ok: false, skipped: true, reason: 'no_api_key' };
  }

  const from = input.from || process.env.RESEND_FROM || DEFAULT_FROM;

  // Resend requires either html or text. If both are empty, surface an
  // error rather than silently dropping.
  if (!input.html && !input.text) {
    return { ok: false, error: 'sendEmail: html or text is required' };
  }

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
      return { ok: false, error: error.message || String(error) };
    }
    return { ok: true, id: data?.id ?? null };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unknown Resend error' };
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
