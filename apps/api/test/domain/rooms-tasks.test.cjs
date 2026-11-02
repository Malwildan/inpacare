const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validatePlacementSpan,
} = require("../../dist/domain/placements/placement-period");
const { parseTaskInstant } = require("../../dist/domain/tasks/tugas-perawatan");

test("placement date interval is inclusive, valid, and limited to one year", () => {
  assert.equal(validatePlacementSpan("2026-10-20", "2026-10-20"), 0);
  assert.equal(validatePlacementSpan("2026-10-20", "2027-10-20"), 365);
  for (const [start, end] of [
    ["2026-02-30", "2026-03-01"],
    ["2026-10-21", "2026-10-20"],
    ["2026-10-20", "2027-10-21"],
  ]) {
    assert.throws(
      () => validatePlacementSpan(start, end),
      (error) => error.code === "VALIDATION_FAILED" && Boolean(error.message),
    );
  }
});

test("task schedule timestamps require an explicit timezone", () => {
  assert.equal(
    parseTaskInstant("2026-11-02T10:30:00+07:00", "Waktu mulai").toISOString(),
    "2026-11-02T03:30:00.000Z",
  );
  for (const value of ["2026-11-02T10:30:00", "not-a-date"]) {
    assert.throws(
      () => parseTaskInstant(value, "Waktu mulai"),
      (error) => error.code === "VALIDATION_FAILED" && /Waktu mulai/.test(error.message),
    );
  }
});
