const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  cycleTransitionAllowed,
} = require("../../dist/domain/cycles/cycle-transition.js");
const {
  hasCompleteBloodPressure,
} = require("../../dist/domain/medical-records/vital-signs.js");
const {
  parseInvoiceMoney,
} = require("../../dist/domain/billing/invoice-total.js");
const { DomainError } = require("../../dist/domain/shared/domain-error.js");

test("invoice values are exact cents and reject unsupported precision or sign", () => {
  assert.equal(parseInvoiceMoney("650000.01"), "650000.01");
  assert.equal(parseInvoiceMoney("0"), "0.00");
  assert.throws(() => parseInvoiceMoney("1.001"), (error) => error.code === "VALIDATION_FAILED");
  assert.throws(() => parseInvoiceMoney("-1.00"), (error) => error.code === "VALIDATION_FAILED");
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

test("domain errors expose a stable code and message without HTTP methods", () => {
  const error = DomainError.validation("Invalid clinical input");
  assert.equal(error.code, "VALIDATION_FAILED");
  assert.equal(error.message, "Invalid clinical input");
  assert.equal(typeof error.getStatus, "undefined");
  assert.equal(typeof error.getResponse, "undefined");
});
