const test = require("node:test");
const assert = require("node:assert/strict");
require("reflect-metadata");
const { SessionGuard } = require("../../dist/presentation/http/guards/session.guard");
const {
  checkOrigin,
  equalToken,
  trustedOrigins,
} = require("../../dist/presentation/http/security/auth-context");
const { DomainError } = require("../../dist/domain/shared/domain-error");
const { today } = require("../../dist/application/shared/runtime");
const { LoginAttempts } = require("../../dist/infrastructure/security/login-attempts");
const { OpaqueSessionTokens } = require("../../dist/infrastructure/security/session-store");
const { AuthUseCases } = require("../../dist/application/auth/auth.use-cases");

test("login attempts throttle one source without locking other users or sources", () => {
  const limiter = new LoginAttempts();
  for (let i = 0; i < 10; i++) limiter.consume("attacker", "rina", 0);
  assert.throws(
    () => limiter.consume("attacker", "rina", 0),
    (error) => error.code === "RATE_LIMITED" && /percobaan/.test(error.message),
  );
  assert.doesNotThrow(() => limiter.consume("legitimate", "rina", 0));
  for (let i = 0; i < 1100; i++)
    limiter.consume(`source-${i}`, `unknown-${i}`, 0);
  assert.doesNotThrow(() =>
    limiter.consume("another-legitimate-source", "rina", 0),
  );
  assert.doesNotThrow(() => limiter.consume("attacker", "rina", 900_001));
});

test("CSRF trusts exact configured HTTP origins and ignores forwarded host", () => {
  const prior = process.env.TRUSTED_ORIGINS;
  try {
    process.env.TRUSTED_ORIGINS = "https://care.example";
    assert.doesNotThrow(() =>
      checkOrigin({ headers: { origin: "https://care.example" } }),
    );
    assert.throws(
      () =>
        checkOrigin({
          headers: {
            origin: "https://evil.example",
            "x-forwarded-host": "evil.example",
          },
        }),
      (error) => error.code === "FORBIDDEN",
    );
    assert.throws(
      () => checkOrigin({ headers: {} }),
      (error) => error.code === "FORBIDDEN",
    );
    for (const origin of [
      "ftp://care.example",
      "https://care.example/path",
      "*",
    ]) {
      process.env.TRUSTED_ORIGINS = origin;
      assert.throws(trustedOrigins);
    }
  } finally {
    if (prior === undefined) delete process.env.TRUSTED_ORIGINS;
    else process.env.TRUSTED_ORIGINS = prior;
  }
});

test("session guard delegates lookup to auth use cases and enforces role and CSRF", async () => {
  const raw = "a".repeat(64);
  const csrfToken = "b".repeat(64);
  const actor = {
    id: "USR-NURSE-1",
    username: "dina",
    name: "Dina",
    role: "PERAWAT",
    coordinator: false,
  };
  let roles;
  let authenticated = true;
  const auth = {
    resolveSession: async (token) => {
      assert.equal(token, raw);
      if (!authenticated) throw DomainError.unauthorized();
      return { actor, csrfToken };
    },
  };
  const guard = new SessionGuard(auth, {
    getAllAndOverride: (key) => (key === "roles" ? roles : false),
  });
  const req = {
    method: "GET",
    headers: { cookie: `session=${raw}` },
    get: (key) => req.headers[key],
  };
  const context = {
    getHandler: () => {},
    getClass: () => {},
    switchToHttp: () => ({ getRequest: () => req }),
  };

  await guard.canActivate(context);
  assert.deepEqual(req.actor, { ...actor, csrfToken });
  roles = ["ADMISI"];
  await assert.rejects(
    guard.canActivate(context),
    (error) => error.code === "FORBIDDEN",
  );
  roles = undefined;
  req.method = "DELETE";
  req.headers.origin = "http://127.0.0.1:3000";
  await assert.rejects(
    guard.canActivate(context),
    (error) => error.code === "FORBIDDEN",
  );
  req.headers["x-csrf-token"] = csrfToken;
  await guard.canActivate(context);
  delete req.headers.cookie;
  await assert.rejects(
    guard.canActivate(context),
    (error) => error.code === "UNAUTHENTICATED",
  );
  req.headers.cookie = `session=${raw}`;
  authenticated = false;
  await assert.rejects(
    guard.canActivate(context),
    (error) => error.code === "UNAUTHENTICATED",
  );
});

test("auth use cases persist only a digest of the opaque session token", async () => {
  const tokens = new OpaqueSessionTokens();
  let storedSession;
  const store = {
    findLoginUser: async () => ({
      id: "USR-NURSE-1",
      username: "dina",
      name: "Dina",
      role: "PERAWAT",
      coordinator: false,
      passwordHash: "test-hash",
    }),
    createSession: async () => assert.fail("sessions are written through the unit of work"),
    deleteSession: async () => {},
    findSession: async () => undefined,
  };
  const uow = {
    run: (operation) => operation({ auth: {
      createSession: async (session) => { storedSession = session; },
    } }),
  };
  const auth = new AuthUseCases(
    store,
    uow,
    { verify: async (hash, password) => hash === "test-hash" && password === "secret" },
    tokens,
    { consume: () => {}, success: () => {} },
  );

  const result = await auth.login({ username: " Dina ", password: "secret", source: "test" });
  assert.match(result.token, /^[a-f0-9]{64}$/);
  assert.equal(storedSession.tokenHash, tokens.digest(result.token));
  assert.notEqual(storedSession.tokenHash, result.token);
  assert.equal(result.user.csrfToken, storedSession.csrfToken);
  assert.equal("passwordHash" in result.user, false);
});

test("token comparison, facility day, and plain domain errors are explicit", () => {
  assert.equal(equalToken("secret", "secret"), true);
  assert.equal(equalToken("secret", "secreT"), false);
  assert.equal(equalToken("secret", ""), false);
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
  const error = DomainError.conflict();
  assert.equal(error.code, "CONFLICT");
  assert.match(error.message, /berubah bersamaan/);
  assert.equal(typeof error.getStatus, "undefined");
  assert.equal(typeof error.getResponse, "undefined");
});
