$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$crossRoot = Join-Path $repoRoot '.local/linux-cross'
$downloadRoot = Join-Path $crossRoot 'downloads'
$logRoot = Join-Path $crossRoot 'logs'
$targetRoot = Join-Path $repoRoot '.local/linux-target'
$toolchain = 'stable-x86_64-pc-windows-gnu'
$target = 'x86_64-unknown-linux-musl'
$cargoHome = Join-Path $repoRoot '.local/cargo'
$rustupHome = Join-Path $repoRoot '.local/rustup'
$mingwBin = Join-Path $repoRoot '.local/mingw/mingw64/bin'
$python = (Get-Command python.exe -ErrorAction Stop).Source
$cargo = Join-Path $cargoHome 'bin/cargo.exe'
$rustup = Join-Path $cargoHome 'bin/rustup.exe'
$rustc = Join-Path $cargoHome 'bin/rustc.exe'

foreach ($path in @($cargo, $rustup, $rustc, (Join-Path $mingwBin 'dlltool.exe'))) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Missing local prerequisite: $path" }
}
New-Item -ItemType Directory -Force -Path $downloadRoot, $logRoot, $targetRoot | Out-Null

function Get-VerifiedArchive([string]$Url, [string]$Name, [string]$Sha256) {
    $archive = Join-Path $downloadRoot $Name
    if (-not (Test-Path -LiteralPath $archive)) {
        & curl.exe -fLsS --retry 2 --connect-timeout 20 --max-time 600 -o "$archive.partial" $Url
        if ($LASTEXITCODE -ne 0) { throw "Download failed ($LASTEXITCODE): $Url" }
        if ((Get-FileHash -LiteralPath "$archive.partial" -Algorithm SHA256).Hash -ne $Sha256) {
            throw "SHA-256 mismatch: $Name"
        }
        Move-Item -LiteralPath "$archive.partial" -Destination $archive
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $Sha256) {
        throw "SHA-256 mismatch: $Name"
    }
    return $archive
}

# Keep at most the final 128 KiB on disk and print at most the final 6 KiB.
function Complete-Log([string]$Path, [int]$ExitCode) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes([System.IO.File]::ReadAllText($Path))
    if ($bytes.Length -gt 131072) {
        $bytes = $bytes[($bytes.Length - 131072)..($bytes.Length - 1)]
    }
    [System.IO.File]::WriteAllBytes($Path, $bytes)
    $offset = [Math]::Max(0, $bytes.Length - 6144)
    Write-Output ([System.Text.Encoding]::UTF8.GetString($bytes, $offset, $bytes.Length - $offset))
    if ($ExitCode -ne 0) { throw "Command failed ($ExitCode). See $Path" }
}

$environment = @{}
$names = @('CARGO_HOME', 'RUSTUP_HOME', 'RUSTUP_TOOLCHAIN', 'CARGO_TARGET_DIR', 'PATH',
    'CARGO_ZIGBUILD_CACHE_DIR', 'CARGO_ZIGBUILD_ZIG_PATH', 'ZIG_GLOBAL_CACHE_DIR',
    'ZIG_LOCAL_CACHE_DIR', 'RUSTFLAGS', 'CARGO_ENCODED_RUSTFLAGS', 'TEMP', 'TMP')
foreach ($name in $names) { $environment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

try {
    $env:CARGO_HOME = $cargoHome
    $env:RUSTUP_HOME = $rustupHome
    $env:RUSTUP_TOOLCHAIN = $toolchain
    $env:CARGO_TARGET_DIR = $targetRoot
    $env:PATH = "$cargoHome/bin;$mingwBin;$env:PATH"
    $env:RUSTFLAGS = '-C target-feature=+crt-static'
    [Environment]::SetEnvironmentVariable('CARGO_ENCODED_RUSTFLAGS', $null, 'Process')
    # rustc's cmd /c batch-linker invocation fails when the wrapper path has spaces.
    # Read the existing 8.3 alias; this changes no volume settings or filesystem links.
    $shortPathCode = @'
import ctypes, sys
fn = ctypes.WinDLL('kernel32', use_last_error=True).GetShortPathNameW
fn.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_uint32]
fn.restype = ctypes.c_uint32
buffer = ctypes.create_unicode_buffer(32768)
assert fn(sys.argv[1], buffer, len(buffer)), 'GetShortPathNameW failed'
assert ' ' not in buffer.value, 'An existing space-free 8.3 path alias is required'
print(buffer.value)
'@
    $shortCrossRoot = & $python -c $shortPathCode $crossRoot
    if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve a space-free local cache path; no system settings were changed.' }
    $env:CARGO_ZIGBUILD_CACHE_DIR = Join-Path $shortCrossRoot 'cache/cargo-zigbuild'
    $env:ZIG_GLOBAL_CACHE_DIR = Join-Path $shortCrossRoot 'cache/zig-global'
    $env:ZIG_LOCAL_CACHE_DIR = Join-Path $shortCrossRoot 'cache/zig-local'
    $env:TEMP = Join-Path $shortCrossRoot 'tmp'
    $env:TMP = $env:TEMP
    New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null

    $rustVersion = & $rustc --version
    if ($LASTEXITCODE -ne 0 -or $rustVersion -notmatch '^rustc 1\.99\.1 ') {
        throw "Expected the installed Rust 1.99.1 GNU toolchain; found: $rustVersion"
    }
    $protectedPaths = @((Join-Path $repoRoot 'apps/api/Cargo.toml'), (Join-Path $repoRoot 'apps/api/Cargo.lock'))
    $protectedPaths += @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'apps/api/src') -File -Recurse | Select-Object -ExpandProperty FullName)
    $sourceHashes = @(Get-FileHash -LiteralPath $protectedPaths -Algorithm SHA256)

    # Hashes are published by the official GitHub release API and Zig download index.
    $cargoArchive = Get-VerifiedArchive `
        'https://github.com/rust-cross/cargo-zigbuild/releases/download/v0.24.0/cargo-zigbuild-x86_64-pc-windows-msvc.zip' `
        'cargo-zigbuild-0.24.0-x86_64-pc-windows-msvc.zip' `
        '2f1637f56e2f59ee980fe548650e874c381a664803ce94f146808e5b9a5e2adf'
    $zigArchive = Get-VerifiedArchive `
        'https://ziglang.org/download/0.17.0/zig-x86_64-windows-0.17.0.zip' `
        'zig-x86_64-windows-0.17.0.zip' `
        'b5663f69581dcf391293fbf16c06cb80d81d806545ce618b4d0bab7f0eb8c428'
    $cargoToolRoot = Join-Path $crossRoot 'tools/cargo-zigbuild-0.24.0'
    $zigToolRoot = Join-Path $crossRoot 'tools/zig'
    $zig = Join-Path $zigToolRoot 'zig-x86_64-windows-0.17.0/zig.exe'
    New-Item -ItemType Directory -Force -Path $cargoToolRoot, $zigToolRoot | Out-Null
    $cargoZigbuild = Get-ChildItem -LiteralPath $cargoToolRoot -Recurse -Filter 'cargo-zigbuild.exe' -File | Select-Object -First 1
    if (-not $cargoZigbuild) {
        & $python -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' $cargoArchive $cargoToolRoot
        if ($LASTEXITCODE -ne 0) { throw 'cargo-zigbuild extraction failed' }
        $cargoZigbuild = Get-ChildItem -LiteralPath $cargoToolRoot -Recurse -Filter 'cargo-zigbuild.exe' -File | Select-Object -First 1
    }
    if (-not (Test-Path -LiteralPath $zig)) {
        & $python -c 'import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])' $zigArchive $zigToolRoot
        if ($LASTEXITCODE -ne 0) { throw 'Zig extraction failed' }
    }
    if (-not $cargoZigbuild) { throw 'cargo-zigbuild.exe is missing from the official archive' }
    $env:CARGO_ZIGBUILD_ZIG_PATH = $zig
    $env:PATH = "$($cargoZigbuild.DirectoryName);$(Split-Path -Parent $zig);$env:PATH"
    $cargoZigVersion = & $cargoZigbuild.FullName --version
    if ($LASTEXITCODE -ne 0 -or $cargoZigVersion -ne 'cargo-zigbuild 0.24.0') { throw "Unexpected cargo-zigbuild version: $cargoZigVersion" }
    $zigVersion = & $zig version
    if ($LASTEXITCODE -ne 0 -or $zigVersion -ne '0.17.0') { throw "Unexpected Zig version: $zigVersion" }
    @($rustVersion, (& $cargo --version), $cargoZigVersion, "Zig $zigVersion", (& $python --version),
        (& (Join-Path $mingwBin 'dlltool.exe') --version | Select-Object -First 1),
        "Target $target", "RUSTFLAGS=$env:RUSTFLAGS") |
        Set-Content -LiteralPath (Join-Path $crossRoot 'versions.txt') -Encoding UTF8

    $targetLog = Join-Path $logRoot 'rustup-target.log'
    $ErrorActionPreference = 'Continue'
    & $rustup target add --toolchain $toolchain $target 2>&1 | ForEach-Object { $_.ToString() } | Out-File -LiteralPath $targetLog -Encoding UTF8
    $targetExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    Complete-Log $targetLog $targetExit

    $buildLog = Join-Path $logRoot 'build.log'
    Write-Output "Building $target with isolated target output at $targetRoot"
    $ErrorActionPreference = 'Continue'
    & $cargo zigbuild --manifest-path (Join-Path $repoRoot 'apps/api/Cargo.toml') --locked --release --target $target 2>&1 | ForEach-Object { $_.ToString() } | Out-File -LiteralPath $buildLog -Encoding UTF8
    $buildExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    Complete-Log $buildLog $buildExit

    foreach ($original in $sourceHashes) {
        if ((Get-FileHash -LiteralPath $original.Path -Algorithm SHA256).Hash -ne $original.Hash) {
            throw "Application input changed during the build: $($original.Path)"
        }
    }

    $verifyElf = @'
import hashlib, json, pathlib, shutil, struct, sys
source, destination = map(pathlib.Path, sys.argv[1:3])
data = source.read_bytes()
assert len(data) >= 64 and data[:4] == b'\x7fELF', 'Not an ELF binary'
assert data[4:7] == bytes([2, 1, 1]), 'Expected ELF64 little endian, version 1'
kind, machine = struct.unpack_from('<HH', data, 16)
assert machine == 62 and kind in (2, 3), 'Expected an x86_64 executable'
phoff = struct.unpack_from('<Q', data, 32)[0]
phentsize, phnum = struct.unpack_from('<HH', data, 54)
assert phentsize == 56 and phnum > 0 and phoff + phentsize * phnum <= len(data), 'Invalid program headers'
headers = [struct.unpack_from('<IIQQQQQQ', data, phoff + i * phentsize) for i in range(phnum)]
assert all(p[2] + p[5] <= len(data) for p in headers), 'Invalid segment bounds'
interpreters = [p for p in headers if p[0] == 3]
dynamic = [p for p in headers if p[0] == 2]
needed = []
for p in dynamic:
    assert p[5] % 16 == 0, 'Invalid dynamic segment'
    for tag, value in struct.iter_unpack('<qQ', data[p[2]:p[2]+p[5]]):
        if tag == 0:
            break
        if tag == 1:
            needed.append(value)
assert not interpreters and not needed, 'Binary needs a dynamic loader or shared libraries'
sha256 = hashlib.sha256(data).hexdigest()
shutil.copyfile(source, destination)
assert hashlib.sha256(destination.read_bytes()).hexdigest() == sha256, 'Copy hash mismatch'
report = dict(format='ELF64', endianness='little', architecture='x86_64', machine=machine,
              elf_type='ET_EXEC' if kind == 2 else 'ET_DYN (static PIE)', target='x86_64-unknown-linux-musl',
              bytes=len(data), sha256=sha256, program_headers=phnum,
              pt_interp=len(interpreters), pt_dynamic=len(dynamic), dt_needed=len(needed),
              linux_execution_tested=False)
(destination.parent / 'elf-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
(destination.parent / 'inpacare-api.sha256').write_bytes(f'{sha256}  inpacare-api\n'.encode('ascii'))
print(json.dumps(report, indent=2))
'@
    & $python -c $verifyElf (Join-Path $targetRoot "$target/release/inpacare-api") (Join-Path $crossRoot 'inpacare-api')
    if ($LASTEXITCODE -ne 0) { throw 'ELF validation failed' }
    [ordered]@{
        completed_utc = [DateTime]::UtcNow.ToString('o')
        command = 'cargo zigbuild --manifest-path apps/api/Cargo.toml --locked --release --target x86_64-unknown-linux-musl'
        target_install_exit_code = $targetExit
        build_exit_code = $buildExit
        input_files_unchanged = $true
        target_directory = $targetRoot
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $crossRoot 'build-status.json') -Encoding UTF8
    Write-Output "Validated binary: $(Join-Path $crossRoot 'inpacare-api')"
    Write-Output 'Linux execution still requires validation on the target host.'
}
finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $environment[$name], 'Process') }
}
