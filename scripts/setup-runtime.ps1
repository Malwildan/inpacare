param(
    [switch]$InstallPostgres = $true
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$localRoot = Join-Path $repoRoot '.local'
$downloadRoot = Join-Path $localRoot 'downloads'
New-Item -ItemType Directory -Force -Path $downloadRoot | Out-Null

$postgresArchive = Join-Path $downloadRoot 'postgresql-17.11-1-windows-x64-binaries.zip'
$postgresRoot = Join-Path $localRoot 'postgresql'
$pgCtl = Join-Path $postgresRoot 'pgsql/bin/pg_ctl.exe'
$pgInitDb = Join-Path $postgresRoot 'pgsql/bin/initdb.exe'
$pgBootstrap = Join-Path $postgresRoot 'pgsql/share/postgres.bki'
if ($InstallPostgres -and (-not (Test-Path $pgCtl) -or -not (Test-Path $pgInitDb) -or -not (Test-Path $pgBootstrap))) {
    if (-not (Test-Path $postgresArchive)) {
        & curl.exe -fL --retry 2 --connect-timeout 20 -o $postgresArchive 'https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64-binaries.zip'
        if ($LASTEXITCODE -ne 0) { throw "PostgreSQL download failed with exit code $LASTEXITCODE" }
    }
    New-Item -ItemType Directory -Force -Path $postgresRoot | Out-Null
    & tar.exe -xf $postgresArchive -C $postgresRoot pgsql/bin pgsql/lib pgsql/share
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL extraction failed with exit code $LASTEXITCODE" }
}

if ($InstallPostgres) {
    if (-not (Test-Path $pgCtl) -or -not (Test-Path $pgInitDb) -or -not (Test-Path $pgBootstrap)) {
        throw "PostgreSQL installation is incomplete under $postgresRoot."
    }
    & (Join-Path $postgresRoot 'pgsql/bin/postgres.exe') --version
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) { throw 'Node.js 24.18 or newer is required. Install Node.js and run npm ci.' }
$nodeVersion = & node.exe -p 'process.versions.node'
if ([version]$nodeVersion -lt [version]'24.18.0') { throw 'Node.js 24.18 or newer is required.' }
Write-Output 'Runtime installation is ready. Run scripts/database.ps1 -Action Start to initialize and start the local database.'
