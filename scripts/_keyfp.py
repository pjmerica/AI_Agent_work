"""Fingerprint the key without revealing it, and read its quota."""
import hashlib, json, os, urllib.request, urllib.error
k = os.environ.get("ODDS_API_KEY", "")
if not k:
    print("no key"); raise SystemExit
print("key length:", len(k))
print("key sha256[:12]:", hashlib.sha256(k.encode()).hexdigest()[:12])
try:
    with urllib.request.urlopen(
        urllib.request.Request(f"https://api.the-odds-api.com/v4/sports/?apiKey={k}"),
        timeout=25) as r:
        h = dict(r.headers)
        print("status 200",
              "| remaining:", h.get("x-requests-remaining"),
              "| used:", h.get("x-requests-used"))
except urllib.error.HTTPError as e:
    h = dict(e.headers)
    print("status", e.code,
          "| remaining:", h.get("x-requests-remaining"),
          "| used:", h.get("x-requests-used"))
    print("body:", e.read().decode()[:160])
