import json, html, sys
sys.path.insert(0, sys.argv[1])
from data import TIERS, RESOURCES
V = json.load(open(sys.argv[1] + '/verified.json'))
OUT = sys.argv[2]

START = {"2501.00656","2411.15124","2406.17557","2304.01373","2312.06550","2412.19437","2501.12948","2402.03300",
 "2405.04434","2505.09388","2501.12599","2506.13585","2508.06471","2503.14476","2407.21783","2503.19786",
 "2401.04088","2412.08905","2504.03624","1707.06347","2203.02155","2305.18290","2503.20783","2504.13837",
 "1706.03762","2203.15556","2205.14135","1910.02054","2309.06180","2209.10652","2409.19256"}
MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
e = html.escape

def fmt(d):
    y, m, dd = d.split('-'); return f"{MON[int(m)-1]} {int(dd)}, {y}"

total = 0
nav, body = [], []
for t in TIERS:
    n_t = sum(len(s['papers']) for s in t['series'])
    total += n_t
    nav.append(f'<a href="#{t["key"]}"><span class="tn">{t["name"]}</span><span class="tl">{e(t["label"])}</span><span class="tc">{n_t}</span></a>')
    parts = [f'<section class="tier" id="{t["key"]}" data-tier="{t["key"]}"><header class="tier-h"><p class="eyebrow">{t["name"]} · {n_t} papers</p><h2>{e(t["label"])}</h2><p class="blurb">{e(t["blurb"])}</p></header>']
    for s in t['series']:
        rows = []
        dates = []
        for pid, short, note in s['papers']:
            star = '<span class="star" title="Start here">★</span>' if pid in START else ''
            badge = f'<span class="badge">{e(note)}</span>' if note else ''
            if pid.startswith('http'):
                full, date, link, idlab = '', '', pid, 'web'
                datecell = '<span class="muted">—</span>'
            else:
                full, date = V[pid]
                dates.append(date[:4])
                link, idlab = f'https://arxiv.org/abs/{pid}', pid
                datecell = f'<time datetime="{date}">{fmt(date)}</time>'
            sub = f'<span class="full">{e(full)}</span>' if full and full.lower() != short.lower() else ''
            rows.append(f'<tr data-q="{e((short+" "+full+" "+pid+" "+s["name"]).lower())}"><td class="d">{datecell}</td>'
                        f'<td class="t"><a href="{e(link)}" target="_blank" rel="noopener"><span class="short">{e(short)}</span></a>{star}{badge}{sub}</td>'
                        f'<td class="id"><a href="{e(link)}" target="_blank" rel="noopener">{idlab}</a></td></tr>')
        span = f'{min(dates)}–{max(dates)}' if dates and min(dates) != max(dates) else (dates[0] if dates else '')
        parts.append(f'<article class="series"><div class="series-h"><div><h3>{e(s["name"])}</h3><p class="org">{e(s["org"])}</p></div>'
                     f'<p class="meta"><span>{len(s["papers"])} papers</span><span>{span}</span></p></div>'
                     f'<p class="why">{e(s["why"])}</p><div class="tw"><table><thead><tr><th>Date</th><th>Paper</th><th>arXiv</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div></article>')
    parts.append('</section>')
    body.append(''.join(parts))

res = ''.join(f'<li><a href="{e(u)}" target="_blank" rel="noopener">{e(n)}</a><span class="badge">{e(k)}</span></li>' for n, u, k in RESOURCES)

order = [("2402.03300","DeepSeekMath (GRPO)"),("2501.12948","DeepSeek-R1"),("2411.15124","Tülu 3"),("2503.14476","DAPO"),
         ("2503.20783","Dr. GRPO"),("2501.12599","Kimi k1.5"),("2505.09388","Qwen3"),("2506.13585","MiniMax-M1"),
         ("2504.13837","RLVR critiques"),("https://github.com/volcengine/verl","verl code")]
ol = ''.join(f'<li><a href="{u if u.startswith("http") else "https://arxiv.org/abs/"+u}" target="_blank" rel="noopener">{e(n)}</a></li>' for u, n in order)

page = f'''<title>LLM Paper Atlas</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,500;7..72,650&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* Layout: a catalog. Sticky tier index on wide screens, tiers > series cards > dated paper tables. */
:root {{
  --bg:#f5f6f8; --surface:#ffffff; --fg:#17202b; --muted:#5d6876; --line:#dde2e8;
  --accent:#1f5f8b; --accent-soft:#e3eef6; --star:#b7791f;
  --f-display:"Literata", Georgia, serif; --f-body:"Instrument Sans", system-ui, sans-serif; --f-mono:"JetBrains Mono", ui-monospace, monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg:#11161c; --surface:#18202a; --fg:#e6ebf0; --muted:#97a3b1; --line:#2a3542;
  --accent:#7db7de; --accent-soft:#1d3346; --star:#e0b45c; color-scheme:dark }} }}
:root[data-theme="dark"] {{
  --bg:#11161c; --surface:#18202a; --fg:#e6ebf0; --muted:#97a3b1; --line:#2a3542;
  --accent:#7db7de; --accent-soft:#1d3346; --star:#e0b45c; color-scheme:dark }}
* {{ box-sizing:border-box }}
body {{ background:var(--bg); color:var(--fg); font:15px/1.55 var(--f-body);
  padding-left:max(16px, env(safe-area-inset-left, 0px)); padding-right:max(16px, env(safe-area-inset-right, 0px)); padding-block:0 64px }}
a {{ color:var(--accent); text-decoration:none }} a:hover {{ text-decoration:underline }}
a:focus-visible, input:focus-visible {{ outline:2px solid var(--accent); outline-offset:2px; border-radius:3px }}
.wrap {{ max-width:1180px; margin:0 auto; display:grid; grid-template-columns:240px minmax(0,1fr); gap:48px }}
.hero {{ max-width:1180px; margin:0 auto; padding-block:48px 28px }}
h1 {{ font:650 clamp(30px,4.6vw,46px)/1.1 var(--f-display); margin:0 0 12px; text-wrap:balance; letter-spacing:-.01em }}
.lede {{ color:var(--muted); max-width:64ch; margin:0 }}
.stats {{ display:flex; flex-wrap:wrap; gap:8px 24px; margin-top:20px; font:500 13px var(--f-mono); color:var(--muted) }}
.stats b {{ color:var(--fg); font-weight:500 }}
aside {{ position:sticky; top:calc(env(safe-area-inset-top, 0px) + 20px); align-self:start; display:flex; flex-direction:column; gap:20px }}
.search {{ width:100%; padding:9px 12px; border:1px solid var(--line); border-radius:6px; background:var(--surface); color:var(--fg); font:inherit }}
nav {{ display:flex; flex-direction:column; gap:2px }}
nav a {{ display:grid; grid-template-columns:auto 1fr; grid-template-rows:auto auto; column-gap:10px; padding:8px 10px; border-radius:6px; color:var(--fg) }}
nav a:hover {{ background:var(--accent-soft); text-decoration:none }}
.tn {{ font:500 11px var(--f-mono); letter-spacing:.06em; text-transform:uppercase; color:var(--accent); grid-row:1 }}
.tc {{ font:12px var(--f-mono); color:var(--muted); grid-row:1; justify-self:end }}
.tl {{ grid-column:1 / -1; font-size:14px }}
.legend {{ font-size:13px; color:var(--muted); display:flex; flex-direction:column; gap:6px }}
.tier {{ display:flex; flex-direction:column; gap:20px; padding-top:8px; margin-bottom:56px; scroll-margin-top:16px }}
.eyebrow {{ font:500 12px var(--f-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--accent); margin:0 0 6px }}
.tier-h h2 {{ font:650 28px/1.2 var(--f-display); margin:0 0 6px; text-wrap:balance }}
.blurb {{ margin:0; color:var(--muted); max-width:64ch }}
.series {{ background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:20px 22px 8px; min-width:0 }}
.series-h {{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap }}
.series h3 {{ font:600 19px/1.3 var(--f-display); margin:0 }}
.org {{ margin:2px 0 0; color:var(--muted); font-size:13px }}
.meta {{ margin:0; display:flex; gap:14px; font:12px var(--f-mono); color:var(--muted); font-variant-numeric:tabular-nums }}
.why {{ margin:10px 0 12px; max-width:70ch }}
.tw {{ overflow-x:auto; margin:0 -22px; padding:0 22px }}
table {{ width:100%; border-collapse:collapse; font-size:14px }}
th {{ text-align:left; font:500 11px var(--f-mono); letter-spacing:.06em; text-transform:uppercase; color:var(--muted); padding:8px 10px 8px 0; border-bottom:1px solid var(--line) }}
td {{ padding:9px 10px 9px 0; border-bottom:1px solid var(--line); vertical-align:top }}
tbody tr:last-child td {{ border-bottom:0 }}
td.d {{ white-space:nowrap; font:12.5px var(--f-mono); color:var(--muted); font-variant-numeric:tabular-nums; width:110px }}
td.id {{ white-space:nowrap; font:12.5px var(--f-mono); width:96px; text-align:right; padding-right:0 }}
.short {{ font-weight:600; color:var(--fg) }}
.full {{ display:block; color:var(--muted); font-size:13px; margin-top:1px }}
.star {{ color:var(--star); margin-left:6px; font-size:13px }}
.badge {{ display:inline-block; margin-left:8px; padding:1px 7px; border-radius:999px; background:var(--accent-soft); color:var(--accent); font:500 11px var(--f-body); vertical-align:1px }}
.muted {{ color:var(--muted) }}
.extras {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:20px }}
.extras ul, .extras ol {{ margin:0; padding-left:20px; display:flex; flex-direction:column; gap:7px }}
.extras ul {{ list-style:none; padding:0 }}
.note {{ font-size:13px; color:var(--muted); max-width:70ch }}
.empty {{ color:var(--muted); font-style:italic }}
@media (max-width:860px) {{
  .wrap {{ grid-template-columns:minmax(0,1fr); gap:24px }}
  aside {{ position:static }}
  nav {{ flex-direction:row; flex-wrap:wrap }}
  nav a {{ border:1px solid var(--line) }}
  td.d {{ width:auto }}
}}
@media (max-width:520px) {{ th:first-child, td.d {{ display:none }} .series {{ padding:16px 16px 6px }} .tw {{ margin:0 -16px; padding:0 16px }} }}
</style>

<div class="hero">
  <p class="eyebrow">Reading map · checked against arXiv, Nov 3, 2026</p>
  <h1>LLM Paper Atlas</h1>
  <p class="lede">Paper series from the labs whose reports teach the most, grouped from fully open pipelines down to the foundations they build on. Each series is in date order. Stars mark a good first paper in each series.</p>
  <p class="stats"><span><b>{total}</b> entries</span><span><b>{sum(len(t["series"]) for t in TIERS)}</b> series</span><span><b>{len(TIERS)}</b> tiers</span></p>
</div>
<div class="wrap">
  <aside>
    <input id="q" class="search" type="search" placeholder="Filter papers, e.g. GRPO, MoE, Qwen" aria-label="Filter papers">
    <nav>{"".join(nav)}<a href="#extras"><span class="tn">Extra</span><span class="tl">Courses, blogs &amp; code</span></a></nav>
    <div class="legend"><span><span class="star">★</span> Start here</span><span><span class="badge" style="margin:0">Note</span> Context on the entry</span></div>
  </aside>
  <main>
    {"".join(body)}
    <section class="tier" id="extras">
      <header class="tier-h"><p class="eyebrow">Extra</p><h2>Courses, blogs &amp; code</h2><p class="blurb">Explanations and codebases that make the papers easier to follow.</p></header>
      <div class="extras">
        <article class="series"><h3>Learning resources</h3><p class="why"></p><ul>{res}</ul><p></p></article>
        <article class="series"><h3>Suggested order for RL work</h3><p class="why"></p><ol>{ol}</ol><p></p></article>
      </div>
      <p class="note">Dates are first arXiv submission (v1). Some arXiv IDs carry a later month than their date, for example DeepSeek-V4 (2606.19348, listed Apr 26, 2026); that is how arXiv lists them. "Co-authored" means DeepSeek researchers co-wrote the paper with a university lab. Llama 4 and SmolLM3 have no arXiv report, so they link to the official blog.</p>
      <p id="none" class="empty" hidden>No papers match that filter.</p>
    </section>
  </main>
</div>
<script>
(function () {{
  var q = document.getElementById('q'), none = document.getElementById('none');
  q.addEventListener('input', function () {{
    var v = q.value.trim().toLowerCase(), any = false;
    document.querySelectorAll('.series').forEach(function (s) {{
      var rows = s.querySelectorAll('tbody tr'); if (!rows.length) return;
      var shown = 0;
      rows.forEach(function (r) {{ var ok = !v || r.dataset.q.indexOf(v) > -1; r.hidden = !ok; if (ok) shown++; }});
      s.hidden = shown === 0; if (shown) any = true;
    }});
    document.querySelectorAll('section.tier[data-tier]').forEach(function (t) {{
      t.hidden = !Array.prototype.some.call(t.querySelectorAll('.series'), function (s) {{ return !s.hidden; }});
    }});
    none.hidden = any || !v;
  }});
}})();
</script>
'''
open(OUT, 'w').write(page)
print(total)
