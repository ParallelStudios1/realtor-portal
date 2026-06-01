/**
 * DocuSign integration. Two modes:
 *   1) If DOCUSIGN_* env vars are NOT set → every method returns a soft
 *      "skipped" result. The app degrades to "paste a URL" mode (existing
 *      linkDocusignAction). No crashes, no scary errors.
 *   2) If env vars ARE set → mint a JWT user token via DocuSign's OAuth and
 *      create an envelope from a document URL via the Envelopes API.
 *
 * Required env to activate:
 *   DOCUSIGN_BASE_URL          e.g. https://demo.docusign.net/restapi
 *   DOCUSIGN_OAUTH_BASE        e.g. https://account-d.docusign.com
 *   DOCUSIGN_INTEGRATION_KEY   (the integration key from DocuSign admin)
 *   DOCUSIGN_USER_ID           (the API user GUID)
 *   DOCUSIGN_ACCOUNT_ID        (the account GUID — different from integration key)
 *   DOCUSIGN_RSA_PRIVATE_KEY   (PEM, line breaks preserved or replaced with literal \n)
 */

type CreateEnvelopeInput = {
  documentUrl: string;
  documentName?: string;
  recipients: Array<{ name: string; email: string; role: 'signer' | 'cc' }>;
  emailSubject?: string;
  emailMessage?: string;
};

export type CreateEnvelopeResult =
  | { ok: true; envelopeId: string; envelopeUrl: string }
  | { ok: false; skipped: true; reason: 'no_config' }
  | { ok: false; error: string };

function readEnv() {
  const keys = [
    'DOCUSIGN_BASE_URL',
    'DOCUSIGN_OAUTH_BASE',
    'DOCUSIGN_INTEGRATION_KEY',
    'DOCUSIGN_USER_ID',
    'DOCUSIGN_ACCOUNT_ID',
    'DOCUSIGN_RSA_PRIVATE_KEY',
  ] as const;
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = process.env[k];
    if (!v) return null;
    out[k] = v;
  }
  // Allow \n-escaped newlines for env-var-friendly PEM.
  out.DOCUSIGN_RSA_PRIVATE_KEY = out.DOCUSIGN_RSA_PRIVATE_KEY.replace(/\\n/g, '\n');
  return out as Record<(typeof keys)[number], string>;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(
  env: ReturnType<typeof readEnv>
): Promise<string | null> {
  if (!env) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  // JWT grant flow.
  const jwt = await import('jsonwebtoken').catch(() => null as any);
  if (!jwt) return null;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: env.DOCUSIGN_INTEGRATION_KEY,
      sub: env.DOCUSIGN_USER_ID,
      iat: now,
      exp: now + 3600,
      aud: env.DOCUSIGN_OAUTH_BASE.replace(/^https?:\/\//, ''),
      scope: 'signature impersonation',
    },
    env.DOCUSIGN_RSA_PRIVATE_KEY,
    { algorithm: 'RS256' }
  );
  const res = await fetch(env.DOCUSIGN_OAUTH_BASE + '/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

export async function createDocusignEnvelope(
  input: CreateEnvelopeInput
): Promise<CreateEnvelopeResult> {
  const env = readEnv();
  if (!env) return { ok: false, skipped: true, reason: 'no_config' };

  const token = await getAccessToken(env);
  if (!token) return { ok: false, error: 'Could not authenticate with DocuSign.' };

  // Fetch the document bytes server-side (so DocuSign sees a clean PDF
  // rather than a redirect to an HTML viewer).
  const docRes = await fetch(input.documentUrl);
  if (!docRes.ok) return { ok: false, error: 'Could not fetch document.' };
  const docBytes = Buffer.from(await docRes.arrayBuffer()).toString('base64');

  const body = {
    emailSubject: input.emailSubject || 'Please sign — ' + (input.documentName || 'document'),
    emailBlurb: input.emailMessage || 'Sent via Realtor Portal.',
    status: 'sent',
    documents: [
      {
        documentBase64: docBytes,
        name: input.documentName || 'document.pdf',
        fileExtension: 'pdf',
        documentId: '1',
      },
    ],
    recipients: {
      signers: input.recipients
        .filter((r) => r.role === 'signer')
        .map((r, i) => ({
          email: r.email,
          name: r.name,
          recipientId: String(i + 1),
          routingOrder: String(i + 1),
          tabs: {
            signHereTabs: [
              {
                anchorString: '/sn1/',
                anchorYOffset: '10',
                anchorUnits: 'pixels',
                anchorXOffset: '20',
              },
            ],
          },
        })),
      carbonCopies: input.recipients
        .filter((r) => r.role === 'cc')
        .map((r, i) => ({
          email: r.email,
          name: r.name,
          recipientId: String(100 + i),
          routingOrder: '99',
        })),
    },
  };

  const url =
    env.DOCUSIGN_BASE_URL +
    '/v2.1/accounts/' +
    env.DOCUSIGN_ACCOUNT_ID +
    '/envelopes';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: 'DocuSign API ' + res.status + ': ' + text.slice(0, 200) };
  }
  const json = (await res.json()) as { envelopeId: string };
  const envelopeId = json.envelopeId;
  // The browser URL the realtor can open to see the envelope:
  const envelopeUrl =
    env.DOCUSIGN_OAUTH_BASE.replace('account', 'app').replace('-d.', '.') +
    '/documents/details/' +
    envelopeId;
  return { ok: true, envelopeId, envelopeUrl };
}

/** Map a raw DocuSign envelope status to our local enum. */
function normalizeStatus(raw: string | undefined | null): string {
  const s = (raw || '').toLowerCase();
  switch (s) {
    case 'created':
    case 'sent':
    case 'delivered':
    case 'completed':
    case 'declined':
    case 'voided':
      return s;
    case 'signed':
      // DocuSign sometimes reports recipient-level "signed" — treat the
      // envelope as completed once it reaches us at envelope level.
      return 'completed';
    default:
      return s || 'sent';
  }
}

export type EnvelopeStatusResult =
  | {
      ok: true;
      status: string;
      completedAt: string | null;
      recipients: any;
    }
  | { ok: false; skipped: true; reason: 'no_config' }
  | { ok: false; error: string };

/**
 * Poll a single envelope's current status directly from the DocuSign API.
 * This is the fallback path when DocuSign Connect (the push webhook) is not
 * configured — the UI can call this to refresh status on demand.
 *
 * Soft-skips (no_config) when DOCUSIGN_* env vars are unset, exactly like
 * createDocusignEnvelope, so callers degrade gracefully.
 */
export async function getEnvelopeStatus(
  envelopeId: string
): Promise<EnvelopeStatusResult> {
  const env = readEnv();
  if (!env) return { ok: false, skipped: true, reason: 'no_config' };

  const token = await getAccessToken(env);
  if (!token) return { ok: false, error: 'Could not authenticate with DocuSign.' };

  const base =
    env.DOCUSIGN_BASE_URL +
    '/v2.1/accounts/' +
    env.DOCUSIGN_ACCOUNT_ID +
    '/envelopes/' +
    encodeURIComponent(envelopeId);

  const res = await fetch(base + '?include=recipients', {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token, accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: 'DocuSign API ' + res.status + ': ' + text.slice(0, 200) };
  }
  const json = (await res.json()) as {
    status?: string;
    completedDateTime?: string;
    recipients?: any;
  };
  return {
    ok: true,
    status: normalizeStatus(json.status),
    completedAt: json.completedDateTime || null,
    recipients: json.recipients ?? null,
  };
}

export { normalizeStatus as normalizeDocusignStatus };
