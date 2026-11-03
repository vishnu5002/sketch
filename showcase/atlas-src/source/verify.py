import json, time, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from data import TIERS
NS={'a':'http://www.w3.org/2005/Atom'}
def fetch(q):
    for i in range(4):
        try:
            return urllib.request.urlopen("https://export.arxiv.org/api/query?"+q, timeout=60).read()
        except Exception as e:
            time.sleep(5)
    raise SystemExit("fail "+q)
def parse(x):
    out=[]
    for e in ET.fromstring(x).findall('a:entry',NS):
        i=e.find('a:id',NS).text.rsplit('/',1)[-1].split('v')[0]
        t=' '.join(e.find('a:title',NS).text.split())
        p=e.find('a:published',NS).text[:10]
        out.append((i,t,p))
    return out
ids=[p[0] for t in TIERS for s in t['series'] for p in s['papers'] if not p[0].startswith(('http','?'))]
res={}
for k in range(0,len(ids),50):
    for i,t,p in parse(fetch(urllib.parse.urlencode({'id_list':','.join(ids[k:k+50]),'max_results':60}))):
        res[i]=(t,p)
    time.sleep(3)
for q in [p[0] for t in TIERS for s in t['series'] for p in s['papers'] if p[0].startswith('?')]:
    r=parse(fetch(urllib.parse.urlencode({'search_query':'ti:"%s"'%q[1:],'max_results':5})))
    print("SEARCH",q,r); time.sleep(3)
missing=[i for i in ids if i not in res]
print("missing",missing)
for t in TIERS:
    for s in t['series']:
        for p in s['papers']:
            if p[0] in res: print(p[0],'|',p[1],'||',res[p[0]][0][:90],'|',res[p[0]][1])
json.dump(res,open('verified.json','w'))
