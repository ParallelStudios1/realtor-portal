#!/usr/bin/env python3
"""Wire the latest processed build to the internal beta group, ensure
test info is set, and verify it is available for testing."""
import jwt, time, json, urllib.request

KEY_ID = '3ST6Z8D74J'
ISSUER_ID = '907a18b2-6f6a-40ee-9e58-7ad1fbb63f6a'
P8 = '/Users/turnerlogan/Downloads/AuthKey_3ST6Z8D74J.p8'
APP_ID = '6768115138'
GROUP_ID = '786a0ae8-9a09-48b9-be63-cb0665d1e0b9'
BUILD_ID = '21205547-afdc-4168-a32f-6f76c4f472c5'

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

# 1. Add the build to the internal group (hasAccessToAllBuilds=true means
#    new builds should auto-add, but explicit is safer for the first one).
print('--- Step 1: link build to internal group ---')
status, resp = req('POST', '/v1/betaGroups/' + GROUP_ID + '/relationships/builds', {
    'data': [{'type': 'builds', 'id': BUILD_ID}],
})
print('  status:', status)
print('  resp:', json.dumps(resp)[:300])

# 2. Check beta app review submission status / beta app review detail.
print()
print('--- Step 2: beta app review detail ---')
status, resp = req('GET', '/v1/apps/' + APP_ID + '/betaAppReviewDetail')
print('  status:', status)
print('  resp:', json.dumps(resp, indent=2)[:800])

# 3. Check beta license agreement
print()
print('--- Step 3: beta license agreement ---')
status, resp = req('GET', '/v1/apps/' + APP_ID + '/betaLicenseAgreement')
print('  status:', status)
print('  resp:', json.dumps(resp, indent=2)[:400])

# 4. Check whether the build has a beta app review submission yet.
print()
print('--- Step 4: build betaAppReviewSubmission ---')
status, resp = req('GET', '/v1/builds/' + BUILD_ID + '/betaAppReviewSubmission')
print('  status:', status)
print('  resp:', json.dumps(resp, indent=2)[:600])

# 5. Check build betaBuildLocalizations
print()
print('--- Step 5: build betaBuildLocalizations ---')
status, resp = req('GET', '/v1/builds/' + BUILD_ID + '/betaBuildLocalizations')
print('  status:', status)
print('  resp:', json.dumps(resp, indent=2)[:800])

# 6. Check the betaTesters relationship for the group.
print()
print('--- Step 6: internal group betaTesters list ---')
status, resp = req('GET', '/v1/betaGroups/' + GROUP_ID + '/betaTesters')
print('  status:', status)
print('  resp:', json.dumps(resp)[:400])
