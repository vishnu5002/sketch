import re, sys, json, html
from html.parser import HTMLParser
s = open(sys.argv[1], encoding="utf8").read()
s = re.sub(r"<script.*?</script>", "", s, flags=re.S)

def text(fragment):
    return html.unescape(re.sub(r"<[^>]+>", "", fragment)).strip()

tiers = []
for t in re.finditer(r'<section class="tier" id="(t\d)"[^>]*>(.*?)</section>', s, re.S):
    tid, body = t.groups()
    tier = {"id": tid, "name": text(re.search(r"<h2>(.*?)</h2>", body, re.S).group(1)),
            "blurb": text(re.search(r'<p class="blurb">(.*?)</p>', body, re.S).group(1)), "series": []}
    for a in re.finditer(r'<article class="series">(.*?)</article>', body, re.S):
        ab = a.group(1)
        se = {"name": text(re.search(r"<h3>(.*?)</h3>", ab, re.S).group(1)),
              "org": text(m.group(1)) if (m := re.search(r'<p class="org">(.*?)</p>', ab, re.S)) else "",
              "why": text(m.group(1)) if (m := re.search(r'<p class="why">(.*?)</p>', ab, re.S)) else "",
              "papers": []}
        for r in re.finditer(r"<tr data-q=[^>]*>(.*?)</tr>", ab, re.S):
            rb = r.group(1)
            dt = re.search(r'<time datetime="([^"]+)">(.*?)</time>', rb)
            tcell = re.search(r'<td class="t">(.*?)</td>', rb, re.S).group(1)
            se["papers"].append({
                "date": dt.group(1) if dt else None,
                "dateLabel": text(dt.group(2)) if dt else None,
                "short": text(re.search(r'<span class="short">(.*?)</span>', tcell, re.S).group(1)),
                "full": text(m.group(1)) if (m := re.search(r'<span class="full">(.*?)</span>', tcell, re.S)) else "",
                "star": 'title="Start here"' in tcell,
                "badges": [text(b) for b in re.findall(r'<span class="badge">(.*?)</span>', tcell, re.S)],
                "url": html.unescape(re.search(r'<a href="([^"]+)"', tcell).group(1)),
                "id": text(re.search(r'<td class="id">(.*?)</td>', rb, re.S).group(1)),
            })
        tier["series"].append(se)
    tiers.append(tier)

ex = s[s.index('id="extras"'):]
groups = []
for g in re.finditer(r"<h3>(.*?)</h3>.*?<(ul|ol)[^>]*>(.*?)</\2>", ex, re.S):
    items = []
    for li in re.finditer(r"<li[^>]*>(.*?)</li>", g.group(3), re.S):
        l = li.group(1)
        m = re.search(r'<a href="([^"]+)"[^>]*>(.*?)</a>', l, re.S)
        k = re.search(r'<span class="badge">(.*?)</span>', l, re.S)
        items.append({"title": text(m.group(2)) if m else text(l), "url": html.unescape(m.group(1)) if m else None, "kind": text(k.group(1)) if k else ""})
    groups.append({"name": text(g.group(1)), "items": items})
note = text(m.group(1)) if (m := re.search(r'<p class="note">(.*?)</p>', ex, re.S)) else ""
json.dump({"tiers": tiers, "extras": groups, "note": note}, open("atlas.json", "w"), indent=1, ensure_ascii=False)
n = sum(len(se["papers"]) for t in tiers for se in t["series"])
print("entries", n, "series", sum(len(t["series"]) for t in tiers), "stars", sum(p["star"] for t in tiers for se in t["series"] for p in se["papers"]))
for t in tiers: print(t["id"], t["name"], sum(len(se["papers"]) for se in t["series"]))
for g in groups: print(g["name"], [(i["title"], i["kind"], (i["url"] or "")[:40]) for i in g["items"]][:14])
