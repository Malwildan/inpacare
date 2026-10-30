param(
    [switch]$InstallPostgres = $true
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$localRoot = Join-Path $repoRoot '.local'
$downloadRoot = Join-Path $localRoot 'downloads'
$rustupHome = Join-Path $localRoot 'rustup'
$cargoHome = Join-Path $localRoot 'cargo'
$mingwRoot = Join-Path $localRoot 'mingw'
$mingwBin = Join-Path $mingwRoot 'mingw64/bin'

New-Item -ItemType Directory -Force -Path $downloadRoot, $rustupHome, $cargoHome | Out-Null
$env:RUSTUP_HOME = $rustupHome
$env:CARGO_HOME = $cargoHome

$rustupInstaller = Join-Path $downloadRoot 'rustup-init.exe'
if (-not (Test-Path $rustupInstaller)) {
    & curl.exe -fL --retry 2 --connect-timeout 20 -o $rustupInstaller 'https://win.rustup.rs/x86_64'
    if ($LASTEXITCODE -ne 0) { throw "rustup download failed with exit code $LASTEXITCODE" }
}

$rustReady=$false
$rustcPath=Join-Path $cargoHome 'bin/rustc.exe'
if(Test-Path -LiteralPath $rustcPath){ & $rustcPath --version *> $null; $rustReady=$LASTEXITCODE -eq 0 }
if(-not $rustReady){
    & $rustupInstaller -y --no-modify-path --profile minimal --default-host x86_64-pc-windows-gnu --default-toolchain stable
    if ($LASTEXITCODE -ne 0) { throw "Rust installation failed with exit code $LASTEXITCODE" }
}

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

if (-not (Test-Path (Join-Path $cargoHome 'bin/rustc.exe'))) { throw 'Rust installation did not create rustc.exe.' }
& (Join-Path $cargoHome 'bin/rustc.exe') --version
& (Join-Path $cargoHome 'bin/cargo.exe') --version

if ($InstallPostgres) {
    if (-not (Test-Path $pgCtl) -or -not (Test-Path $pgInitDb) -or -not (Test-Path $pgBootstrap)) {
        throw "PostgreSQL installation is incomplete under $postgresRoot."
    }
    & (Join-Path $postgresRoot 'pgsql/bin/postgres.exe') --version
}

$mingwPackages = @(
    @{ Name = 'mingw-w64-x86_64-binutils-2.47-4-any.pkg.tar.zst'; Sha256 = 'E36C52A7FE1D104C2EFD97DC74162386EABF8323F6AEB9B83AEB574B291A7DA0' },
    @{ Name = 'mingw-w64-x86_64-gettext-runtime-1.0-1-any.pkg.tar.zst'; Sha256 = 'BE68D7F260633284B910C588C6D82EE304A81C8817A686D2CD9DF83F872C27AF' },
    @{ Name = 'mingw-w64-x86_64-libiconv-1.19-1-any.pkg.tar.zst'; Sha256 = '21E334D0911F25DE75D3E18E0697648BCECFA9658256D600CAD0827D719C2F35' },
    @{ Name = 'mingw-w64-x86_64-libwinpthread-14.0.0.r569.g34eeafb7d-1-any.pkg.tar.zst'; Sha256 = '7774D48F1B2727F54C8148E5994A4A8E464DFA2DD5A177E630EBFD522DCBE2C0' },
    @{ Name = 'mingw-w64-x86_64-zlib-1.3.2-3-any.pkg.tar.zst'; Sha256 = 'FFDE6F4ED2D879477C93B37FF14C319BAF480A2AEAFC065EDECEAFBA26B71E90' },
    @{ Name = 'mingw-w64-x86_64-zstd-1.5.7-2-any.pkg.tar.zst'; Sha256 = '1ADD6705B344664F6ACA108C85F79AB5BDD9E1162662BB06A4CF40A34F6E0907' }
)
$mingwReady=$false
$dlltoolPath=Join-Path $mingwBin 'dlltool.exe'
if(Test-Path -LiteralPath $dlltoolPath){ & $dlltoolPath --version *> $null; $mingwReady=$LASTEXITCODE -eq 0 }
foreach ($package in $mingwPackages) {
    if($mingwReady){break}
    $packagePath = Join-Path $downloadRoot $package.Name
    if (-not (Test-Path $packagePath)) {
        $packageUrl = "https://mirror.msys2.org/mingw/mingw64/$($package.Name)"
        & curl.exe -fL --retry 2 --connect-timeout 20 -o $packagePath $packageUrl
        if ($LASTEXITCODE -ne 0) { throw "MinGW package download failed: $($package.Name)" }
    }
    if ((Get-FileHash -Algorithm SHA256 $packagePath).Hash -ne $package.Sha256) {
        throw "MinGW package hash mismatch: $($package.Name)"
    }
    & tar.exe -xf $packagePath -C $mingwRoot
    if ($LASTEXITCODE -ne 0) { throw "MinGW package extraction failed: $($package.Name)" }
}

if (-not (Test-Path (Join-Path $mingwBin 'dlltool.exe'))) { throw 'MinGW binutils installation is missing dlltool.exe.' }
$env:PATH = "$mingwBin;$cargoHome/bin;$env:PATH"
& (Join-Path $mingwBin 'dlltool.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'The local dlltool runtime dependencies are incomplete.' }

Write-Output 'Runtime installation is ready. Run scripts/database.ps1 -Action Start to initialize and start the local database.'
