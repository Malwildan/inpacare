param([switch]$SkipBuild,[ValidateSet('Debug','Release')][string]$Configuration='Debug')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$env:RUSTUP_HOME=Join-Path $projectRoot '.local/rustup'
$env:CARGO_HOME=Join-Path $projectRoot '.local/cargo'
$env:PATH=(Join-Path $env:CARGO_HOME 'bin')+';'+(Join-Path $projectRoot '.local/mingw/mingw64/bin')+';'+$env:PATH
if(-not $SkipBuild){
 $buildArguments=@('build','--locked','--manifest-path','apps/api/Cargo.toml')
 if($Configuration -eq 'Release'){$buildArguments+='--release'}
 & cargo @buildArguments
 if($LASTEXITCODE -ne 0){throw 'API build failed'}
}
& (Join-Path $PSScriptRoot 'database.ps1') -Action Start
$pgBin=Join-Path $projectRoot '.local/postgresql/pgsql/bin'
$env:PGPASSWORD=(Get-Content -LiteralPath (Join-Path $projectRoot '.local/postgres-superuser-password.txt') -Raw).Trim()
$testDatabase='inpacare_test_'+[guid]::NewGuid().ToString('N').Substring(0,12)
& (Join-Path $pgBin 'createdb.exe') -h 127.0.0.1 -p 55432 -U postgres -O inpacare $testDatabase
if($LASTEXITCODE -ne 0){throw 'Disposable database creation failed'}
$apiProcess=$null
$result=1
try {
 $env:DATABASE_URL='postgres://inpacare:inpacare@127.0.0.1:55432/'+$testDatabase
 $env:SEED_DEMO='1'
 $env:API_BIND='127.0.0.1:8081'
 $apiFolder=if($Configuration -eq 'Release'){'release'}else{'debug'}
 $apiProcess=Start-Process -FilePath (Join-Path $projectRoot "apps/api/target/$apiFolder/inpacare-api.exe") -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot '.local/test-api.stdout.log') -RedirectStandardError (Join-Path $projectRoot '.local/test-api.stderr.log')
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
 Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
 Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
exit $result
