# Linux application build

The NestJS API and SvelteKit frontend compile to Node.js JavaScript. They do not require a Linux ELF cross-build. Build on Windows with:

```powershell
./scripts/build-linux.ps1
```

This installs locked npm dependencies and creates `apps/api/dist` and `apps/web/build`. The resulting JavaScript is portable across supported Node.js 24.18+ hosts. Native deployment packaging and smoke checks run on Linux in CI with `scripts/package-native.sh`.

The native host still uses Linux-specific Node.js and PostgreSQL runtime binaries. Install those through [native hosting](NATIVE_HOSTING.md); do not copy a Windows PostgreSQL data directory to Linux or across PostgreSQL major versions.
