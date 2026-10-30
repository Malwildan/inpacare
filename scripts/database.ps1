param(
    [ValidateSet('Start', 'Stop', 'Status')]
    [string]$Action = 'Start'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$localRoot = Join-Path $repoRoot '.local'
$postgresRoot = Join-Path $localRoot 'postgresql/pgsql'
$pgBin = Join-Path $postgresRoot 'bin'
$dataRoot = Join-Path $localRoot 'postgres-data'
$logPath = Join-Path $localRoot 'postgres.log'
$superPasswordPath = Join-Path $localRoot 'postgres-superuser-password.txt'
$connectionPath = Join-Path $localRoot 'database-url.txt'
$port = 55432

foreach ($binary in @('pg_ctl.exe', 'initdb.exe', 'psql.exe', 'createdb.exe')) {
    if (-not (Test-Path (Join-Path $pgBin $binary))) {
        throw "Local PostgreSQL tools are missing. Run scripts/setup-runtime.ps1 first. Missing: $binary"
    }
}

$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
$initdb = Join-Path $pgBin 'initdb.exe'
$psql = Join-Path $pgBin 'psql.exe'
$createdb = Join-Path $pgBin 'createdb.exe'
$env:PATH = "$pgBin;$env:PATH"
$env:PGPASSWORD = 'inpacare'

function Test-ProjectServer {
    & $pgCtl -D $dataRoot status *> $null
    return $LASTEXITCODE -eq 0
}

function Test-ProjectConnection {
    $value = & $psql --no-psqlrc --no-align --tuples-only --quiet --host 127.0.0.1 --port $port --username inpacare --dbname inpacare --command 'SELECT 1' 2>$null
    return ($LASTEXITCODE -eq 0 -and $value.Trim() -eq '1')
}

if ($Action -eq 'Status') {
    if (Test-ProjectServer) {
        if (Test-ProjectConnection) { Write-Output 'InpaCare PostgreSQL is running on 127.0.0.1:55432 (database inpacare).' }
        else { Write-Output 'The project PostgreSQL process is running, but the InpaCare database connection failed.'; exit 1 }
    } else { Write-Output 'InpaCare PostgreSQL is stopped.' }
    exit 0
}

if ($Action -eq 'Stop') {
    if (Test-ProjectServer) {
        & $pgCtl -D $dataRoot -m fast -w stop
        if ($LASTEXITCODE -ne 0) { throw "PostgreSQL shutdown failed with exit code $LASTEXITCODE" }
        Write-Output 'Stopped the InpaCare PostgreSQL instance.'
    } else { Write-Output 'InpaCare PostgreSQL is already stopped.' }
    exit 0
}

if (-not (Test-Path $dataRoot)) {
    $tcp = [System.Net.Sockets.TcpClient]::new()
    try {
        $connect = $tcp.BeginConnect('127.0.0.1', $port, $null, $null)
        if ($connect.AsyncWaitHandle.WaitOne(250) -and $tcp.Connected) {
            throw "Port $port is already in use. The setup will not touch another process."
        }
    } finally { $tcp.Dispose() }

    if (-not (Test-Path $superPasswordPath)) {
        $bytes = [byte[]]::new(36)
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        $password = [Convert]::ToBase64String($bytes).TrimEnd('=')
        [System.IO.File]::WriteAllText($superPasswordPath, $password, [System.Text.UTF8Encoding]::new($false))
    }
    $superPassword = [System.IO.File]::ReadAllText($superPasswordPath).Trim()
    $pwFile = Join-Path $localRoot 'postgres-bootstrap-password.tmp'
    [System.IO.File]::WriteAllText($pwFile, $superPassword, [System.Text.UTF8Encoding]::new($false))
    try {
        & $initdb --pgdata $dataRoot --username postgres --pwfile $pwFile --auth-local trust --auth-host scram-sha-256 --encoding UTF8 --no-locale
        if ($LASTEXITCODE -ne 0) { throw "PostgreSQL initialization failed with exit code $LASTEXITCODE" }
    } finally { Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue }
}

if (-not (Test-ProjectServer)) {
    $tcp = [System.Net.Sockets.TcpClient]::new()
    try {
        $connect = $tcp.BeginConnect('127.0.0.1', $port, $null, $null)
        if ($connect.AsyncWaitHandle.WaitOne(250) -and $tcp.Connected) {
            throw "Port $port is already in use. The setup will not touch another process."
        }
    } finally { $tcp.Dispose() }

    & $pgCtl -D $dataRoot -l $logPath -o "-h 127.0.0.1 -p $port -c listen_addresses=127.0.0.1" -w start
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL start failed with exit code $LASTEXITCODE. Inspect $logPath" }
}

$env:PGPASSWORD = [System.IO.File]::ReadAllText($superPasswordPath).Trim()
$roleExists = & $psql --no-psqlrc --no-align --tuples-only --quiet --host 127.0.0.1 --port $port --username postgres --dbname postgres --command "SELECT 1 FROM pg_roles WHERE rolname='inpacare'"
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect local PostgreSQL roles.' }
if ("$roleExists".Trim() -eq '1') {
    & $psql --no-psqlrc --set ON_ERROR_STOP=1 --host 127.0.0.1 --port $port --username postgres --dbname postgres --command "ALTER ROLE inpacare LOGIN PASSWORD 'inpacare'" --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Could not update the local inpacare role.' }
} else {
    & $psql --no-psqlrc --set ON_ERROR_STOP=1 --host 127.0.0.1 --port $port --username postgres --dbname postgres --command "CREATE ROLE inpacare LOGIN PASSWORD 'inpacare'"
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the local inpacare role.' }
}

$exists = & $psql --no-psqlrc --no-align --tuples-only --quiet --host 127.0.0.1 --port $port --username postgres --dbname postgres --command "SELECT 1 FROM pg_database WHERE datname='inpacare'" 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect local PostgreSQL databases.' }
if ("$exists".Trim() -ne '1') {
    & $createdb --host 127.0.0.1 --port $port --username postgres --owner inpacare --encoding UTF8 inpacare
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the local inpacare database.' }
}

$env:PGPASSWORD = 'inpacare'
$url = 'postgres://inpacare:inpacare@127.0.0.1:55432/inpacare'
[System.IO.File]::WriteAllText($connectionPath, $url, [System.Text.UTF8Encoding]::new($false))
$proof = & $psql --no-psqlrc --no-align --tuples-only --quiet --host 127.0.0.1 --port $port --username inpacare --dbname inpacare --command "SELECT current_database() || ':' || current_user || ':' || inet_server_addr()"
if ($LASTEXITCODE -ne 0) { throw 'Local PostgreSQL health query failed.' }
Write-Output "InpaCare PostgreSQL is ready: $($proof.Trim()). Connection details are in .local/database-url.txt."
