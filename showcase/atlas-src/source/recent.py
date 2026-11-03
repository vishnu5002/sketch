import time, urllib.request, urllib.parse, xml.etree.ElementTree as ET
NS={'a':'http://www.w3.org/2005/Atom'}
qs=['Qwen3.5','Qwen4','Qwen3-Next','Qwen3-Omni','Kimi','GLM-5','GLM-4.6','MiniMax','Gemma 4','Nemotron 3','Nemotron','Phi-5','Llama 4','Seed2','Seed-OSS','Mistral','Magistral','Olmo','SmolLM','Pythia','Tulu','Molmo']
for q in qs:
    url="https://export.arxiv.org/api/query?"+urllib.parse.urlencode({'search_query':'ti:"%s" AND submittedDate:[202511010000 TO 202611030000]'%q,'max_results':15,'sortBy':'submittedDate'})
    try: x=urllib.request.urlopen(url,timeout=60).read()
    except Exception as e: print(q,'ERR',e); continue
    for e in ET.fromstring(x).findall('a:entry',NS):
        t=' '.join(e.find('a:title',NS).text.split())
        if any(w in t.lower() for w in ['technical report','tech report',': ','open']) :
            au=[a.find('a:name',NS).text for a in e.findall('a:author',NS)][:3]
            print(q,'|',e.find('a:id',NS).text.rsplit('/',1)[-1],'|',t[:100],'|',e.find('a:published',NS).text[:10],'|',au)
    time.sleep(3)
