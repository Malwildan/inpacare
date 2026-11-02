$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Node.js 24 or newer and npm are required.' }
& npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
& npm.cmd run build:api
if ($LASTEXITCODE -ne 0) { throw 'API build failed' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
Write-Output 'Node.js API and frontend builds are ready. Create the Linux release archive on Linux with scripts/package-native.sh.'
