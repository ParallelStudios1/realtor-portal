#!/usr/bin/env python3
"""Create an internal TestFlight beta group with access to all builds.
Turner (account holder) gets TestFlight access automatically by virtue of
his ACCOUNT_HOLDER+ADMIN role, so he should see the build in the
TestFlight iOS app once internal testing is enabled."""
import jwt, time, json, urllib.request

KEY_ID = '3ST6Z8D74J'
ISSUER_ID = '907a18b2-6f6a-40ee-9e58-7ad1fbb63f6a'
P8 = '/Users/turnerlogan/Downloads/AuthKey_3ST6Z8D74J.p8'
APP_ID = '6768115138'
TURNER_USER_ID = '627b68ba-f1c6-49ab-98ff-f403567ae890'

def make_token():
    key = open(P8).read()
    return jwt.encode(
        {'iss': ISSUER_ID, 'exp': int(time.time()) + 1100, 'aud': 'appstoreconnect-v1'},
        key, algorithm='ES256', headers={'kid': KEY_ID},
    )

def post(path, body):
    req = urllib.request.Request(
        'https://api.appstoreconnect.apple.com' + path,
        data=json.dumps(body).encode(),
        headers={
            'Authorization': 'Bearer ' + make_token(),
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b'{}')

# 1. Create internal beta group with access to all builds.
body = {
    'data': {
        'type': 'betaGroups',
        'attributes': {
            'name': 'Internal Testers',
            'publicLinkEnabled': False,
            'isInternalGroup': True,
            'hasAccessToAllBuilds': True,
        },
        'relationships': {
            'app': {'data': {'type': 'apps', 'id': APP_ID}},
        },
    }
}

status, resp = post('/v1/betaGroups', body)
print('Create internal group ->', status)
print(json.dumps(resp, indent=2))
