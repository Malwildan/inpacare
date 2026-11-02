const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  cycleTransitionAllowed,
} = require("../dist/modules/cycles/cycles.service.js");
const {
  hasCompleteBloodPressure,
} = require("../dist/modules/medical-records/rekam-medis.service.js");
const {
  parseInvoiceMoney,
} = require("../dist/modules/billing/tagihan.service.js");

test("invoice values are exact cents and reject unsupported precision or sign", () => {
  assert.equal(parseInvoiceMoney("650000.01"), "650000.01");
  assert.equal(parseInvoiceMoney("0"), "0.00");
  assert.throws(() => parseInvoiceMoney("1.001"));
  assert.throws(() => parseInvoiceMoney("-1.00"));
});

test("cycle transitions follow the assigned then in-care order", () => {
  assert.equal(cycleTransitionAllowed("pending", "assigned"), true);
  assert.equal(cycleTransitionAllowed("assigned", "in_care"), true);
  assert.equal(cycleTransitionAllowed("pending", "in_care"), false);
  assert.equal(cycleTransitionAllowed("in_care", "released"), false);
});

test("blood pressure accepts both values or neither", () => {
  assert.equal(hasCompleteBloodPressure(undefined, undefined), true);
  assert.equal(hasCompleteBloodPressure(120, 80), true);
  assert.equal(hasCompleteBloodPressure(120, undefined), false);
  assert.equal(hasCompleteBloodPressure(undefined, 80), false);
});
