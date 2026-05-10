#!/usr/bin/env python3
"""List ASC beta groups + beta testers for the Realtor Portal app."""
import jwt, time, json, os, urllib.request

KEY_ID = '3ST6Z8D74J'
ISSUER_ID = '907a18b2-6f6a-40ee-9e58-7ad1fbb63f6a'
P8 = '/Users/turnerlogan/Downloads/AuthKey_3ST6Z8D74J.p8'
APP_ID = '6768115138'

def make_token():
    key = open(P8).read()
    return jwt.encode(
        {'iss': ISSUER_ID, 'exp': int(time.time()) + 1100, 'aud': 'appstoreconnect-v1'},
        key, algorithm='ES256', headers={'kid': KEY_ID},
    )

def get(path):
    req = urllib.request.Request(
        'https://api.appstoreconnect.apple.com' + path,
        headers={'Authorization': 'Bearer ' + make_token()},
    )
    with urllib.request.urlopen(req) as r:
        return json.load(r)

print('=== Beta groups ===')
groups = get('/v1/betaGroups?filter%5Bapp%5D=' + APP_ID + '&limit=20')
for g in groups.get('data', []):
    gid = g['id']
    a = g['attributes']
    name = a.get('name')
    internal = a.get('isInternalGroup')
    print('  id=' + gid + '  name=' + str(name) + '  internal=' + str(internal))

print()
print('=== Beta testers ===')
testers = get('/v1/betaTesters?filter%5Bapps%5D=' + APP_ID + '&limit=50')
for t in testers.get('data', []):
    tid = t['id']
    a = t['attributes']
    email = a.get('email')
    fn = a.get('firstName')
    ln = a.get('lastName')
    print('  id=' + tid + '  email=' + str(email) + '  name=' + str(fn) + ' ' + str(ln))

print()
print('=== Latest build ===')
builds = get('/v1/builds?filter%5Bapp%5D=' + APP_ID + '&sort=-uploadedDate&limit=1')
for b in builds.get('data', []):
    print('  id=' + b['id'] + '  version=' + str(b['attributes'].get('version')) + '  state=' + str(b['attributes'].get('processingState')))
