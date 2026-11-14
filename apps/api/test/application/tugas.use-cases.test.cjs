const { test } = require("node:test");
const assert = require("node:assert/strict");
const { TugasUseCases } = require("../../dist/application/tasks/tugas.use-cases");
const actor = { id: "nurse", username: "nurse", name: "Nurse", role: "PERAWAT", coordinator: true };
const task = { id: "task", title: "Original", description: "Description", notes: "Initial", priority: "normal", status: "todo", starts_at: "2026-11-02T00:00:00Z", ends_at: "2026-11-02T01:00:00Z", pic_id: actor.id, version: 1, deleted_at: null };

test("task use case uses transactional ports for its write, audit and authoritative response", async () => {
  const calls = [];
  const transactional = {
    lockTask: async () => ({ task, placement: { status: "active", starts_on: "2026-11-01", ends_on: "2026-11-03" } }),
    requireActivePic: async id => calls.push(["pic", id]),
    updateTask: async (id, next) => calls.push(["write", id, next]),
    historyChange: async event => calls.push(["history", event]),
    detail: async () => ({ id: task.id, version: 2 }),
  };
  const reads = new Proxy({}, { get() { throw new Error("write escaped its transaction"); } });
  const service = new TugasUseCases(reads, { run: work => work({ tasks: transactional }) });
  const result = await service.update(actor, task.id, { expectedVersion: 1, notes: "Updated" });
  assert.deepEqual(calls.map(call => call[0]), ["pic", "write", "history"]);
  assert.deepEqual(result, { id: task.id, version: 2 });
  assert.equal(calls[2][1].before.notes, "Initial");
  assert.equal(calls[2][1].after.notes, "Updated");
  assert.ok("starts_at" in calls[2][1].after, "existing audit JSON field names are part of the contract");
  assert.ok(!("startsAt" in calls[2][1].after));
});
test("task use case rejects stale versions before executing any write", async () => {
  const store = {
    lockTask: async () => ({ task, placement: { status: "active" } }),
    updateTask: async () => assert.fail("must not write a stale command"),
  };
  const service = new TugasUseCases({}, { run: work => work({ tasks: store }) });
  await assert.rejects(service.update(actor, task.id, { expectedVersion: 9, notes: "Stale" }), error => error.code === "CONFLICT");
});

test("board listing forwards explicit ordering while preserving pagination", async () => {
  const service = new TugasUseCases({ list: async (_actor, filters) => filters }, {});
  const result = await service.list(actor, { order: "board", status: "todo", limit: 20, offset: 10 });
  assert.equal(result.order, "board");
  assert.equal(result.status, "todo");
  assert.equal(result.offset, 10);
});

test("moving to the same position leaves version and history unchanged", async () => {
  const store = {
    lockBoard: async () => {},
    lockTask: async () => ({ task, placement: { status: "active" } }),
    movePosition: async () => false,
    detail: async () => ({ id: task.id, version: 1 }),
    historyChange: async () => assert.fail("no history for a no-op"),
  };
  const service = new TugasUseCases({}, { run: work => work({ tasks: store }) });
  assert.deepEqual(await service.move(actor, task.id, { expectedVersion: 1, status: "todo", beforeTaskId: null }), { id: task.id, version: 1 });
});
