"""Ask the API what plan this key actually has, using one cheap request.

/v4/sports is free (does not bill a credit) and still returns the quota headers,
so this reports the true remaining balance and usage without spending anything.
"""
import json, os, sys, urllib.request, urllib.error

key = os.environ.get("ODDS_API_KEY")
if not key:
    print("ODDS_API_KEY not set")
    sys.exit(0)

url = f"https://api.the-odds-api.com/v4/sports/?apiKey={key}"
try:
    with urllib.request.urlopen(urllib.request.Request(url), timeout=25) as r:
        body = r.read().decode()
        hdrs = dict(r.headers)
        print("status 200")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    hdrs = dict(e.headers)
    print("status", e.code)

for k, v in hdrs.items():
    if "request" in k.lower() or "quota" in k.lower() or "credit" in k.lower():
        print(f"  {k}: {v}")
print("body:", body[:200])
