"""Run API workflows on an isolated database on the native Linux host."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

root=Path(__file__).resolve().parent.parent
node=root/'.runtime/node/bin/node'
npm=root/'.runtime/node/bin/npm'
private={line.split('=',1)[0]:line.split('=',1)[1] for line in (root/'.data/native.env').read_text().splitlines() if '=' in line}
pgbin=root/'.runtime/postgres/usr/lib/postgresql/16/bin'
lib=root/'.runtime/postgres/usr/lib/x86_64-linux-gnu'
admin=(root/'.data/admin-password').read_text().strip()
dburl=urllib.parse.urlsplit(private['DATABASE_URL'])
environment=dict(os.environ,LD_LIBRARY_PATH=str(lib),PGPASSWORD=admin)
database='inpacare_test_'+uuid.uuid4().hex[:12]
seed_password=os.environ.get('SEED_DEMO_PASSWORD','InpaCareDemo!2026')
def admin_sql(sql):
    result=subprocess.run([str(pgbin/'psql'),'-X','-qAt','-h','127.0.0.1','-p','55432','-U','inpacare_admin','-d','postgres','-v','ON_ERROR_STOP=1'],input=sql,capture_output=True,text=True,env=environment)
    if result.returncode:raise RuntimeError('Test database operation failed; no production data was changed.')

server=None
try:
    admin_sql('CREATE DATABASE '+database+' OWNER inpacare;')
    api_environment={**os.environ,**private,'DATABASE_URL':private['DATABASE_URL'].rsplit('/',1)[0]+'/'+database,'API_BIND':'127.0.0.1:8081','TRUSTED_ORIGINS':'http://127.0.0.1:8081','SEED_DEMO_PASSWORD':seed_password}
    subprocess.run([str(npm),'run','migration:run','--workspace','@inpacare/api'],cwd=root,env=api_environment,check=True,capture_output=True,timeout=120)
    subprocess.run([str(npm),'run','seed','--workspace','@inpacare/api'],cwd=root,env=api_environment,check=True,capture_output=True,timeout=120)
    log=(root/'.data/test-api.log').open('wb')
    server=subprocess.Popen([str(node),str(root/'apps/api/dist/main.js')],cwd=root,env=api_environment,stdout=log,stderr=log)
    for _ in range(50):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8081/health',timeout=1) as response:
                if response.status==200:break
        except (OSError,urllib.error.URLError):
            time.sleep(.2)
    else:raise RuntimeError('Disposable API did not start; inspect .data/test-api.log.')
    tests=subprocess.run([sys.executable,'-m','unittest','discover','-s','tests/api','-v'],cwd=root,env=dict(os.environ,SEED_DEMO_PASSWORD=seed_password,INPACARE_TEST_URL='http://127.0.0.1:8081/api/v1'),capture_output=True,text=True,timeout=120)
    report=tests.stdout+tests.stderr
    (root/'.data/api-test-results.log').write_text(report)
    print(report[-9000:])
    outcome=tests.returncode
finally:
    if server is not None:
        server.terminate()
        try:server.wait(timeout=10)
        except subprocess.TimeoutExpired:server.kill();server.wait()
    admin_sql('DROP DATABASE '+database+';')
sys.exit(outcome)
