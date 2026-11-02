const { test } = require("node:test");
const assert = require("node:assert/strict");
const { TugasPerawatan } = require("../../dist/domain/tasks/tugas-perawatan");
const nurse = { id: "nurse", role: "PERAWAT", coordinator: false };
const coordinator = { ...nurse, coordinator: true };
const state = { title: "Original", description: "Description", notes: "Initial", priority: "normal", status: "todo", startsAt: new Date("2026-11-02T00:00:00Z"), endsAt: new Date("2026-11-02T01:00:00Z") };

test("task model permits PIC progress and notes while protecting coordinator fields", () => {
  const task = new TugasPerawatan(state);
  const revised = task.revise(nurse, { expectedVersion: 1, status: "in_progress", notes: "Observed" });
  assert.equal(revised.status, "in_progress");
  assert.equal(revised.notes, "Observed");
  assert.equal(state.notes, "Initial", "a revision must not mutate its input snapshot");
  assert.throws(() => task.revise(nurse, { expectedVersion: 1, title: "Changed" }), e => e.code === "FORBIDDEN");
});
test("task model rejects unsupported transitions, missing cancellation reasons and backwards schedules", () => {
  const task = new TugasPerawatan(state);
  for (const change of [{ status: "done" }, { status: "cancelled", reason: " " }, { endsAt: "2026-11-01T23:00:00Z" }])
    assert.throws(() => task.revise(coordinator, { expectedVersion: 1, ...change }), e => e.code === "VALIDATION_FAILED");
  assert.equal(task.revise(coordinator, { expectedVersion: 1, status: "cancelled", reason: "Duplicate" }).status, "cancelled");
});
