# Linux API cross-build from Windows

Run from the repository root in PowerShell:

```powershell
& ./scripts/build-linux.ps1
```

This builds the existing `apps/api/Cargo.toml` with `--locked --release` for
`x86_64-unknown-linux-musl`. The manifest's thin LTO, single codegen unit, and
symbol stripping remain in effect. `RUSTFLAGS=-C target-feature=+crt-static`
explicitly requests static linking. Application sources, manifests, the lockfile,
and schema do not need changes.

## Local prerequisites

- The existing Rust **1.99.1** toolchain, host
  `stable-x86_64-pc-windows-gnu`, in `.local/cargo` and `.local/rustup`.
- The existing `.local/mingw/mingw64/bin/dlltool.exe` and its local DLLs for
  Windows GNU host dependencies and procedural macros.
- Python 3 with its standard library, PowerShell, and `curl.exe` on Windows.
- HTTPS access to the official release URLs below and Rust's target distribution
  server on the first run. Existing Cargo dependency downloads are reused.

The script adds only the musl Rust target to the existing local toolchain; it
does not update Rust, install global tools, or change system settings. Its process
environment is restored on exit. It reads no application authentication files
and needs no running database, Docker, WSL, or Linux VM.

## Pinned portable tools and provenance

The script verifies the archive SHA-256 before extracting or running either tool.
Both download caches and extracted executables are under `.local/linux-cross`.
No pip install or global Cargo install is needed.

| Tool | Version | Official archive | SHA-256 |
| --- | --- | --- | --- |
| cargo-zigbuild | 0.24.0 | [Windows x86_64 release](https://github.com/rust-cross/cargo-zigbuild/releases/download/v0.24.0/cargo-zigbuild-x86_64-pc-windows-msvc.zip) | `2f1637f56e2f59ee980fe548650e874c381a664803ce94f146808e5b9a5e2adf` |
| Zig | 0.17.0 | [Windows x86_64 release](https://ziglang.org/download/0.17.0/zig-x86_64-windows-0.17.0.zip) | `b5663f69581dcf391293fbf16c06cb80d81d806545ce618b4d0bab7f0eb8c428` |

Hash sources: the [official cargo-zigbuild GitHub release API](https://api.github.com/repos/rust-cross/cargo-zigbuild/releases/tags/v0.24.0)
(`assets[].digest`) and the [official Zig download index](https://ziglang.org/download/index.json)
(`0.17.0.x86_64-windows.shasum`). Release metadata captured during setup is also
in `.local/linux-cross/cargo-zigbuild-releases.json` and `zig-index.json`.
The [cargo-zigbuild README](https://github.com/rust-cross/cargo-zigbuild#usage)
documents installing the Rust target and cross-compiling with Zig.

## Build isolation and outputs

The script sets `CARGO_HOME=.local/cargo`, `RUSTUP_HOME=.local/rustup`, and
`RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-gnu`. Its PATH prepends only the local
Cargo, MinGW, cargo-zigbuild, and Zig directories. The build command is:

```text
cargo zigbuild --manifest-path <repo>/apps/api/Cargo.toml --locked --release --target x86_64-unknown-linux-musl
```

- `CARGO_TARGET_DIR=.local/linux-target`: separate from `apps/api/target`, so the
  Windows release output and its target locks are untouched.
- `CARGO_ZIGBUILD_CACHE_DIR`, `ZIG_GLOBAL_CACHE_DIR`, and `ZIG_LOCAL_CACHE_DIR`:
  under `.local/linux-cross/cache`.
- Process `TEMP`/`TMP`: `.local/linux-cross/tmp`.
- Compiled output: `.local/linux-target/x86_64-unknown-linux-musl/release/inpacare-api`.
- Transfer artifact: `.local/linux-cross/inpacare-api`.
- Checksum: `.local/linux-cross/inpacare-api.sha256`.
- Machine-readable validation: `.local/linux-cross/elf-report.json`.
- Exact executed tool versions: `.local/linux-cross/versions.txt`.
- Successful command, exit codes, and completion time: `.local/linux-cross/build-status.json`.
- Target installation log: `.local/linux-cross/logs/rustup-target.log`.
- Cargo build log: `.local/linux-cross/logs/build.log`.
- First successful full release build: `.local/linux-cross/logs/build-release-success.log`
  and `.local/linux-cross/build-status-release.json`.

Each completed command log retains at most its last 128 KiB; the script prints
at most its last 6 KiB. Nonzero Rust target installation or build exits fail the
script. The script also checks that the API sources, manifest, and lockfile did
not change during compilation.

The first link attempt exited **101** because `rustc` invoked cargo-zigbuild's
Windows batch linker through `cmd /c` with a wrapper path containing the space
in `RSI 2`. Its UTF-8 log is retained as
`.local/linux-cross/logs/build-first-link-failure.log`.
The script now reads the existing Windows 8.3 alias of `.local/linux-cross`
using `GetShortPathNameW` and uses that space-free alias for tool caches and
temporary files. These resolve to the same owned directories. It creates no
drive mapping or filesystem junction and changes no volume settings. If no
space-free alias is available on another Windows machine, the script stops
with a clear error.

## Artifact validation and runtime boundary

Python standard-library assertions check the ELF magic, 64-bit little-endian
format, x86_64 machine ID 62, executable type, and program-header bounds. The
script rejects an ELF interpreter (`PT_INTERP`) or shared-library dependencies
(`DT_NEEDED`), then checks that the copied transfer artifact has the same SHA-256.
A static PIE may have `PT_DYNAMIC`; that alone does not imply shared libraries.

The intended receiver is x86_64 Linux Mint on Intel Mac hardware. This is a Linux
ELF executable, not a macOS executable. Static musl avoids a dependency on the
receiver's glibc version; PostgreSQL and the existing application configuration
are still runtime requirements. No GNU/glibc fallback is used by this script.

On the receiving Linux host, the parent can verify the transferred binary and
checksum file together:

```sh
sha256sum -c inpacare-api.sha256
file inpacare-api
readelf -h -l -d inpacare-api
chmod +x inpacare-api
```

Cross-compilation and ELF inspection on Windows do not establish Linux execution,
database connectivity, or API runtime behavior. Those checks and deployment are
left to the parent on the receiving Linux host. No new application unit tests are
needed for this build-only change.

## Verified result (2026-10-29)

- Tool versions actually executed: Rust/Cargo **1.99.1**, cargo-zigbuild **0.24.0**,
  Zig **0.17.0**, Python **3.14.6**; the full strings are in `versions.txt`.
- Rust target installation exit **0**; Cargo release build exit **0**.
- Successful full release build: **5m 09s**. The final script rerun reused the
  cache, completed in **0.95s**, and produced the identical artifact hash.
- Artifact size: **4,523,024 bytes**.
- Header: **ELF64, little-endian, x86_64 (machine 62), ET_EXEC**.
- Program headers: **9**; `PT_INTERP=0`, `PT_DYNAMIC=0`, `DT_NEEDED=0`.
- SHA-256:
  `502a598f9ef6f0e3118933a105dd90d8d693f4a8337381ba4aee2ab250ad07bb`.
- The SHA-256 sidecar uses LF line endings for `sha256sum -c` on Linux.
- API source, Cargo manifest/lockfile, and Windows release executable hashes
  match the pre-build snapshots. The script's process environment restoration
  was checked after both successful invocations.
- No GNU/glibc fallback, application changes, system configuration changes,
  Linux execution, or deployment were needed for this artifact.
