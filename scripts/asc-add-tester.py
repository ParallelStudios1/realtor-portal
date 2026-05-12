#!/usr/bin/env python3
"""Add Turner to the internal TestFlight group as a beta tester."""
import jwt, time, json, urllib.request, urllib.error

KEY_ID = '544WW2NRWY'
ISSUER_ID = '907a18b2-6f6a-40ee-9e58-7ad1fbb63f6a'
P8 = '/Users/turnerlogan/Downloads/AuthKey_544WW2NRWY.p8'
GROUP_ID = '786a0ae8-9a09-48b9-be63-cb0665d1e0b9'

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

print('--- POST /v1/betaTesters (with internal group attached) ---')
body = {
    'data': {
        'type': 'betaTesters',
        'attributes': {
            'email': 'turnerlogan@parallelstudios.co',
            'firstName': 'Turner',
            'lastName': 'Logan',
        },
        'relationships': {
            'betaGroups': {
                'data': [{'type': 'betaGroups', 'id': GROUP_ID}],
            },
        },
    }
}
status, resp = req('POST', '/v1/betaTesters', body)
print('  status:', status)
print('  resp:', json.dumps(resp, indent=2)[:1200])

print()
print('--- Re-list group testers ---')
status, resp = req('GET', '/v1/betaGroups/' + GROUP_ID + '/betaTesters')
print('  status:', status)
print('  resp:', json.dumps(resp, indent=2)[:600])
