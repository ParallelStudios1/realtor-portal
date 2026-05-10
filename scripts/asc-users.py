#!/usr/bin/env python3
"""List ASC team users (for internal TestFlight membership)."""
import jwt, time, json, urllib.request

KEY_ID = '3ST6Z8D74J'
ISSUER_ID = '907a18b2-6f6a-40ee-9e58-7ad1fbb63f6a'
P8 = '/Users/turnerlogan/Downloads/AuthKey_3ST6Z8D74J.p8'

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

print('=== ASC team users ===')
users = get('/v1/users?limit=50')
for u in users.get('data', []):
    uid = u['id']
    a = u['attributes']
    print('  id=' + uid +
          '  user=' + str(a.get('username')) +
          '  firstName=' + str(a.get('firstName')) +
          '  lastName=' + str(a.get('lastName')) +
          '  roles=' + str(a.get('roles')) +
          '  allApps=' + str(a.get('allAppsVisible')))

print()
print('=== User invitations (pending) ===')
invs = get('/v1/userInvitations?limit=20')
for i in invs.get('data', []):
    a = i['attributes']
    print('  email=' + str(a.get('email')) + '  roles=' + str(a.get('roles')))
