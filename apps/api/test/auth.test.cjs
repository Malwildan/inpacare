const test = require("node:test");
const assert = require("node:assert/strict");
require("reflect-metadata");
const {
  SessionGuard,
  digest,
  equalToken,
  checkOrigin,
  trustedOrigins,
} = require("../dist/common/auth");
const { AppError } = require("../dist/common/errors");
const { today } = require("../dist/common/domain");

test("CSRF only trusts explicit HTTP origins and ignores forwarded host", () => {
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
      (e) => e.getStatus() === 403,
    );
    assert.throws(
      () => checkOrigin({ headers: {} }),
      (e) => e.getStatus() === 403,
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

test("session guard hashes opaque cookie, authenticates actor, and enforces role and CSRF", async () => {
  const raw = "a".repeat(64),
    csrfToken = "b".repeat(64);
  const actor = {
    id: "USR-NURSE-1",
    username: "dina",
    name: "Dina",
    role: "PERAWAT",
    coordinator: false,
    csrfToken,
  };
  let roles;
  const db = {
    query: async (_sql, params) => {
      assert.equal(params[0], digest(raw));
      return [actor];
    },
  };
  const guard = new SessionGuard(db, {
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
  assert.equal(req.actor.id, actor.id);
  roles = ["ADMISI"];
  await assert.rejects(
    guard.canActivate(context),
    (e) => e.getStatus() === 403,
  );
  roles = undefined;
  req.method = "DELETE";
  req.headers.origin = "http://127.0.0.1:3000";
  await assert.rejects(
    guard.canActivate(context),
    (e) => e.getStatus() === 403,
  );
  req.headers["x-csrf-token"] = csrfToken;
  await guard.canActivate(context);
  delete req.headers.cookie;
  await assert.rejects(
    guard.canActivate(context),
    (e) => e.getStatus() === 401,
  );
});

test("CSRF token comparison and facility day are explicit", () => {
  assert.equal(equalToken("secret", "secret"), true);
  assert.equal(equalToken("secret", "secreT"), false);
  assert.equal(equalToken("secret", ""), false);
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(AppError.conflict().getStatus(), 409);
});
