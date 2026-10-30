# Local runtime setup

This Windows development setup keeps Rust, PostgreSQL, database files and connection details in the ignored `.local/` directory. It does not install system services or bind PostgreSQL outside loopback.

## Install and start

Run PowerShell from the project root:

```powershell
./scripts/setup-runtime.ps1
./scripts/database.ps1 -Action Start
```

The installer uses rustup's minimal stable `x86_64-pc-windows-gnu` toolchain, [EDB's PostgreSQL 17.11 Windows binary archive](https://www.enterprisedb.com/download-postgresql-binaries), and hash-verified [MSYS2 MinGW-w64 binutils packages](https://packages.msys2.org/packages/mingw-w64-x86_64-binutils). It downloads each archive once into `.local/downloads/`, then installs/unpacks it under `.local/`. Rust and Cargo are available through `.local/cargo/bin`; `dlltool.exe` and its runtime libraries live in `.local/mingw/mingw64/bin`. The app's runner should set `RUSTUP_HOME` and `CARGO_HOME` to the project-local folders and prepend both `.local/cargo/bin` and `.local/mingw/mingw64/bin` to `PATH` before invoking Cargo.

The first database start creates the cluster and an `inpacare` database and role. The API connection URL is written to `.local/database-url.txt`:

```text
postgres://inpacare:inpacare@127.0.0.1:55432/inpacare
```

This fixed password is for the synthetic local demo only. PostgreSQL listens on `127.0.0.1:55432`; the generated local superuser password is held in `.local/postgres-superuser-password.txt` and is not used by the app.

## Manage the local database

```powershell
./scripts/database.ps1 -Action Status
./scripts/database.ps1 -Action Stop
./scripts/database.ps1 -Action Start
```

`Stop` targets the cluster in `.local/postgres-data` and will not stop any other PostgreSQL instance. To reset a demo dataset, stop the server and remove only `.local/postgres-data`; the next start creates a fresh cluster. Never put real patient or production credentials in this local demo.

## Limits

The helper uses the isolated GNU target so the app can build without a machine-wide Visual Studio C++ toolchain. If a future dependency requires an external C compiler or native system library, install a project-local MinGW toolchain or use the documented MSVC setup before adding it. This runtime is for local development and coursework review, not hospital deployment.
