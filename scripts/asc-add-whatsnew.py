#!/usr/bin/env python3
"""Add 'What to Test' notes for the current TestFlight build."""
import jwt, time, json, urllib.request, urllib.error

KEY_ID = '544WW2NRWY'
ISSUER_ID = '907a18b2-6f6a-40ee-9e58-7ad1fbb63f6a'
P8 = '/Users/turnerlogan/Downloads/AuthKey_544WW2NRWY.p8'
BUILD_ID = '21205547-afdc-4168-a32f-6f76c4f472c5'

WHATS_NEW = """First TestFlight build. What to validate:

1. Signup flow - try all three roles (Realtor, Buyer, Seller) on both web and mobile.
2. Magic-link invite - realtor invites a client, client opens link, lands in client app (not 'no account' screen).
3. Tour requests - client requests a tour, realtor confirms/declines, both sides see realtime updates.
4. Document upload - realtor uploads a PDF for a client, client downloads via signed URL.
5. AI listing descriptions - tap 'Generate' on Add House, see Claude-generated copy.
6. Messaging - in-app messages between realtor and client, with push notifications.
7. Stripe checkout - realtor signup -> Solo plan -> live Stripe checkout completes.
8. Branding - firm admin changes brand color, mobile app picks it up next launch.

Known gaps still being polished:
- Resend transactional emails (RESEND_API_KEY pending in Vercel)
- Sentry tracing (DSNs pending)
- Anthropic AI fallback uses stub copy when ANTHROPIC_API_KEY is unset

Build pipeline: commit 92f9912, EAS 1b68498c, auto-submitted via API key."""

def make_token():
    key = open(P8).read()
    return jwt.encode(
        {'iss': ISSUER_ID, 'exp': int(time.time()) + 1100, 'aud': 'appstoreconnect-v1'},
        key, algorithm='ES256', headers={'kid': KEY_ID},
    )

def req(method, path, body=None):
    url = 'https://api.appstoreconnect.apple.com' + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {'Authorization': 'Bearer ' + make_token()}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {'raw': raw.decode(errors='replace')}

print('--- Create en-US betaBuildLocalization ---')
body = {
    'data': {
        'type': 'betaBuildLocalizations',
        'attributes': {
            'locale': 'en-US',
            'whatsNew': WHATS_NEW,
        },
        'relationships': {
            'build': {'data': {'type': 'builds', 'id': BUILD_ID}},
        },
    }
}
status, resp = req('POST', '/v1/betaBuildLocalizations', body)
print('  status:', status)
print('  resp:', json.dumps(resp, indent=2)[:600])
