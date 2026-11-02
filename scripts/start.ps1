param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
& (Join-Path $PSScriptRoot 'setup-runtime.ps1')
& (Join-Path $PSScriptRoot 'database.ps1') -Action start
if (-not $SkipBuild) {
 & npm.cmd ci --no-audit --no-fund
 if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
 & npm.cmd run build:api
 if ($LASTEXITCODE -ne 0) { throw 'API build failed' }
 & npm.cmd run build
 if ($LASTEXITCODE -ne 0) { throw 'Web release build failed' }
}
$pidFile = Join-Path $projectRoot '.local/app-processes.json'
if (Test-Path -LiteralPath $pidFile) {
 $previous = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
 foreach ($item in @($previous.api, $previous.web)) {
  if (Get-Process -Id $item -ErrorAction SilentlyContinue) { throw 'A previous project process is running. Use scripts/stop.ps1 first.' }
 }
}
if (-not $env:DATABASE_URL) { $env:DATABASE_URL = (Get-Content -LiteralPath (Join-Path $projectRoot '.local/database-url.txt') -Raw).Trim() }
$env:API_BIND = '127.0.0.1:8080'
$env:TRUSTED_ORIGINS = 'http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:8080'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$apiFile = Join-Path $projectRoot 'apps/api/dist/main.js'
if (-not (Test-Path -LiteralPath $apiFile)) { throw 'Compiled API is missing. Run npm run build:api first.' }
$webProcess = $null
$apiProcess = Start-Process -FilePath $node -ArgumentList @('"' + $apiFile + '"') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot '.local/api.stdout.log') -RedirectStandardError (Join-Path $projectRoot '.local/api.stderr.log')
try {
 $ready = $false
 for ($attempt=0; $attempt -lt 30; $attempt++) {
  try { $health = Invoke-RestMethod 'http://127.0.0.1:8080/health' -TimeoutSec 2; if ($health.status -eq 'ok') { $ready=$true; break } } catch {}
  Start-Sleep -Milliseconds 500
 }
 if (-not $ready) { throw 'API did not become healthy; see .local/api.stderr.log' }
 $env:API_ORIGIN = 'http://127.0.0.1:8080'
 $env:HOST = '127.0.0.1'
 $env:PORT = '3000'
 $webFile = Join-Path $projectRoot 'apps/web/build/index.js'
 $webProcess = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList @(('"' + $webFile + '"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $projectRoot '.local/web.stdout.log') -RedirectStandardError (Join-Path $projectRoot '.local/web.stderr.log')
 @{api=$apiProcess.Id;web=$webProcess.Id;root=$projectRoot;apiMode='node'} | ConvertTo-Json | Set-Content -LiteralPath $pidFile
 $webReady=$false
 for ($attempt=0;$attempt -lt 20;$attempt++) {
  try { $result=Invoke-WebRequest 'http://127.0.0.1:3000/login' -UseBasicParsing -TimeoutSec 2; if($result.StatusCode -eq 200){$webReady=$true;break} } catch {}
  Start-Sleep -Milliseconds 500
 }
 if(-not $webReady){throw 'Web did not become healthy; see .local/web.stderr.log'}
 Write-Output 'InpaCare is running at http://127.0.0.1:3000'
} catch {
 if ($webProcess -and -not $webProcess.HasExited) { Stop-Process -Id $webProcess.Id -ErrorAction SilentlyContinue }
 if ($apiProcess -and -not $apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue }
 Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
 throw
}
