"""Short authenticated loopback smoke, not a capacity benchmark or field Web Vitals."""
import concurrent.futures
import gzip
import http.cookiejar
import json
import math
import os
from pathlib import Path
import statistics
import time
import urllib.request
from datetime import datetime, timezone

base=os.environ.get('INPACARE_URL','http://127.0.0.1:3000').rstrip('/')
jar=http.cookiejar.CookieJar()
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
request=urllib.request.Request(base+'/api/v1/session',data=json.dumps({'username':'rina','password':'InpaCareDemo!2026'}).encode(),headers={'Content-Type':'application/json','Origin':base},method='POST')
with client.open(request,timeout=15) as response:
    assert response.status==200
cookie='; '.join(f'{c.name}={c.value}' for c in jar)
paths=['/api/v1/rooms','/api/v1/tasks?limit=50','/api/v1/reference']

def measure(index):
    path=paths[index%len(paths)]
    started=time.perf_counter()
    req=urllib.request.Request(base+path,headers={'Cookie':cookie})
    with urllib.request.urlopen(req,timeout=15) as response:
        body=response.read()
        assert response.status==200
        json.loads(body)
    return (time.perf_counter()-started)*1000,len(body),path

for i in range(6):measure(i)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    measured=list(pool.map(measure,range(60)))
times=sorted(row[0] for row in measured)
client_files=list(Path('apps/web/build/client/_app/immutable').rglob('*.js'))
process_record=Path('.local/app-processes.json')
mode=json.loads(process_record.read_text(encoding='utf-8-sig')).get('apiMode','unknown') if process_record.exists() else 'unknown'
result={
 'measuredAt':datetime.now(timezone.utc).isoformat(),
 'scope':'Synthetic local read smoke: 60 requests, 5 concurrent workers; no hospital load/field UX claim.',
 'apiBuildMode':mode,
 'baseUrl':base,'requests':len(times),'concurrency':5,'unexpectedFailures':0,
 'latencyMs':{'median':round(statistics.median(times),2),'p95':round(times[math.ceil(len(times)*.95)-1],2),'max':round(max(times),2)},
 'meanJsonResponseBytes':round(statistics.mean(row[1] for row in measured)),
 'clientJavaScript':{'allRoutesGzipBytes':sum(len(gzip.compress(p.read_bytes())) for p in client_files),'note':'Sum of all lazy route chunks; initial-route payload differs.'},
 'limitations':['Loopback only','12 seeded patients and 200 tasks plus browser demo additions','Read workload only','No sustained capacity or field Web Vitals measurement']
}
out=Path('docs/validation/performance-smoke.json');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result,indent=2))
