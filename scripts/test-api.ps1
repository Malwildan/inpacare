param([switch]$SkipBuild)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if(-not $SkipBuild){
 & npm.cmd run build:api
 if($LASTEXITCODE -ne 0){throw 'API build failed'}
}
$oldEnv=@{}
foreach($name in @('DATABASE_URL','SEED_DEMO_PASSWORD','PGPASSWORD','API_BIND','TRUSTED_ORIGINS','INPACARE_TEST_URL','PYTHONIOENCODING')){$oldEnv[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
& (Join-Path $PSScriptRoot 'database.ps1') -Action Start
$pgBin=Join-Path $projectRoot '.local/postgresql/pgsql/bin'
$env:PGPASSWORD=(Get-Content -LiteralPath (Join-Path $projectRoot '.local/postgres-superuser-password.txt') -Raw).Trim()
$testDatabase='inpacare_test_'+[guid]::NewGuid().ToString('N').Substring(0,12)
& (Join-Path $pgBin 'createdb.exe') -h 127.0.0.1 -p 55432 -U postgres -O inpacare $testDatabase
if($LASTEXITCODE -ne 0){throw 'Disposable database creation failed'}
$apiProcess=$null
$result=1
$oldDatabaseUrl=$env:DATABASE_URL
$oldDemoPassword=$env:SEED_DEMO_PASSWORD
try {
 $env:DATABASE_URL='postgres://inpacare:inpacare@127.0.0.1:55432/'+$testDatabase
 $env:SEED_DEMO_PASSWORD=if($env:SEED_DEMO_PASSWORD){$env:SEED_DEMO_PASSWORD}else{'InpaCareDemo!2026'}
 $env:API_BIND='127.0.0.1:8081'
 $env:TRUSTED_ORIGINS='http://127.0.0.1:8081'
 & npm.cmd run migration:run --workspace @inpacare/api
 if($LASTEXITCODE -ne 0){throw 'Migration failed for disposable API database'}
 & npm.cmd run seed --workspace @inpacare/api
 if($LASTEXITCODE -ne 0){throw 'Demo seed failed for disposable API database'}
 $apiFile=Join-Path $projectRoot 'apps/api/dist/main.js'
 $apiProcess=Start-Process -FilePath (Get-Command node.exe -ErrorAction Stop).Source -ArgumentList @('"'+$apiFile+'"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot '.local/test-api.stdout.log') -RedirectStandardError (Join-Path $projectRoot '.local/test-api.stderr.log')
 $ready=$false
 for($attempt=0;$attempt -lt 30;$attempt++){
  try{$health=Invoke-RestMethod 'http://127.0.0.1:8081/health' -TimeoutSec 1;if($health.status -eq 'ok'){$ready=$true;break}}catch{}
  if($apiProcess.HasExited){break}
  Start-Sleep -Milliseconds 400
 }
 if(-not $ready){throw 'Test API not healthy; see .local/test-api.stderr.log'}
 $env:INPACARE_TEST_URL='http://127.0.0.1:8081/api/v1'
 $env:PYTHONIOENCODING='utf-8'
 & python -m unittest discover -s tests/api -v
 $result=$LASTEXITCODE
} finally {
 if($apiProcess -and -not $apiProcess.HasExited){Stop-Process -Id $apiProcess.Id;Wait-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue}
 if($testDatabase -match '^inpacare_test_[0-9a-f]{12}$'){
  & (Join-Path $pgBin 'dropdb.exe') -h 127.0.0.1 -p 55432 -U postgres $testDatabase
 }
 foreach($name in $oldEnv.Keys){if($null -eq $oldEnv[$name]){Remove-Item "Env:$name" -ErrorAction SilentlyContinue}else{[Environment]::SetEnvironmentVariable($name,$oldEnv[$name],'Process')}}
}
exit $result
