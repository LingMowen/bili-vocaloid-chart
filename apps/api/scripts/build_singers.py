import sys, json, time, urllib.request, urllib.parse, datetime
sys.stdout.reconfigure(encoding='utf-8')

BASE = "https://api.vocabili.top/v3"
ALIASES = {"miku": "初音ミク"}

def get(path):
    req = urllib.request.Request(BASE + path, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))

def suggest(name):
    u = BASE + "/search/suggest?" + urllib.parse.urlencode({"q": name, "types": "vocalist", "limit": 8})
    req = urllib.request.Request(u, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))

girls = json.load(open(r"cache\girls.json", encoding="utf-8"))
names = [g["name"] for g in girls["list"]]

out = {"generated_at": datetime.datetime.now().isoformat(timespec="seconds"), "singers": {}}
for name in names:
    q = ALIASES.get(name, name)
    try:
        hits = suggest(q)
        main = None
        for h in hits:
            if h["type"] == "vocalist" and h["name"] == q:
                main = h; break
        if main is None and hits:
            main = hits[0]
        if main is None:
            out["singers"][name] = {"name": name, "error": "no match"}
            print(f"[{name}] no match")
            continue
        vid = main["id"]
        detail = get(f"/vocalist/{vid}")
        d = detail["data"]
        try:
            syn = get(f"/vocalist/{vid}/stats/synthesizers")
            engs = []
            for s in syn.get("data", []):
                if s.get("synthesizer") and s["count"] > 0:
                    engs.append({"id": s["synthesizer"]["id"], "name": s["synthesizer"]["name"], "count": s["count"]})
            engs.sort(key=lambda e: -e["count"])
        except Exception:
            engs = []
        out["singers"][name] = {
            "name": d["name"], "vocabili_id": d["id"], "vocadb_id": d.get("vocadb_id"),
            "picture": d.get("picture"), "is_vs": d.get("is_vs", False),
            "engines": engs,
        }
        print(f"[{name}] -> {d['name']} (id {d['id']}) engines={[e['name'] for e in engs[:4]]}")
    except Exception as e:
        out["singers"][name] = {"name": name, "error": str(e)}
        print(f"[{name}] ERROR {e}")
    time.sleep(0.2)

with open(r"cache\singers.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("done, saved", len(out["singers"]), "singers")
