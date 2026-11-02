const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validatePlacementSpan,
} = require("../dist/modules/placements/assign-ruangan.service");
const { parseTaskInstant } = require("../dist/modules/tasks/tugas.service");

test("placement date interval is inclusive, valid, and limited to one year", () => {
  assert.equal(validatePlacementSpan("2026-10-20", "2026-10-20"), 0);
  assert.equal(validatePlacementSpan("2026-10-20", "2027-10-20"), 365);
  assert.throws(() => validatePlacementSpan("2026-02-30", "2026-03-01"));
  assert.throws(() => validatePlacementSpan("2026-10-21", "2026-10-20"));
  assert.throws(() => validatePlacementSpan("2026-10-20", "2027-10-21"));
});

test("task schedule timestamps require an explicit timezone", () => {
  assert.equal(
    parseTaskInstant("2026-11-02T10:30:00+07:00", "Waktu mulai").toISOString(),
    "2026-11-02T03:30:00.000Z",
  );
  assert.throws(() => parseTaskInstant("2026-11-02T10:30:00", "Waktu mulai"));
  assert.throws(() => parseTaskInstant("not-a-date", "Waktu mulai"));
});
