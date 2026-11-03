const { test } = require("node:test");
const assert = require("node:assert/strict");
const { TagihanUseCases } = require("../../dist/application/billing/tagihan.use-cases");
const actor = { id: "adm", username: "adm", name: "Adm", role: "ADMISI", coordinator: false };

test("combined invoice edit recalculates totals, preserves omitted line metadata, and audits atomically", async () => {
  const calls = [];
  const row = { version: 4, status: "unpaid", total_amount: "100.00", covered_amount: "10.00", payable_amount: "90.00", bpjs_snapshot: true };
  const billing = {
    lockInvoice: async () => row,
    invoiceLines: async () => [{ id: "line1", room_item_id: "room-item", kind: "medication", description: "Old", quantity: 1, unit_price: "100.00", line_total: "100.00" }],
    replaceLines: async (id, lines) => calls.push(["lines", id, lines]),
    updateInvoice: async (id, data) => calls.push(["update", id, data]),
    history: async event => calls.push(["history", event]),
  };
  const service = new TagihanUseCases({}, { run: work => work({ billing }) });
  const result = await service.changePayment(actor, "invoice", {
    lines: [{ description: "New", quantity: 2, unitPrice: "25.25" }],
    coveredAmount: "5.50", reason: "Correction", expectedVersion: 4,
  });
  assert.equal(result.totalAmount, "50.50");
  assert.equal(result.coveredAmount, "5.50");
  assert.equal(result.payableAmount, "45.00");
  assert.equal(result.version, 5);
  assert.equal(calls[0][2][0].roomItemId, "room-item");
  assert.equal(calls[0][2][0].kind, "medication");
  assert.equal(calls[1][2].total, "50.50");
  assert.equal(calls[2][1].action, "updated");
  assert.equal(calls[2][1].before.lines[0].roomItemId, "room-item");
});

test("invoice edits reject stale versions, paid invoices, and invalid coverage before writing", async () => {
  let row = { version: 2, status: "unpaid", total_amount: "100.00", covered_amount: "10.00", payable_amount: "90.00", bpjs_snapshot: true };
  let writes = 0;
  const billing = {
    lockInvoice: async () => row,
    invoiceLines: async () => [],
    updateInvoice: async () => { writes++; },
    replaceLines: async () => { writes++; },
    history: async () => { writes++; },
  };
  const service = new TagihanUseCases({}, { run: work => work({ billing }) });
  const change = { coveredAmount: "5.00", reason: "Correction", expectedVersion: 2 };
  await assert.rejects(service.changePayment(actor, "invoice", { ...change, expectedVersion: 1 }), { code: "CONFLICT" });
  row.status = "paid";
  await assert.rejects(service.changePayment(actor, "invoice", change), { code: "CONFLICT" });
  row.status = "unpaid";
  await assert.rejects(service.changePayment(actor, "invoice", { ...change, coveredAmount: "100.01" }), { code: "VALIDATION_FAILED" });
  row.bpjs_snapshot = false;
  await assert.rejects(service.changePayment(actor, "invoice", change), { code: "VALIDATION_FAILED" });
  await assert.rejects(service.changePayment(actor, "invoice", { reason: "No changes", expectedVersion: 2 }), { code: "VALIDATION_FAILED" });
  await assert.rejects(service.changePayment({ ...actor, role: "PERAWAT" }, "invoice", change), { code: "FORBIDDEN" });
  assert.equal(writes, 0);
});

test("invoice edits can clear a room item and settle an unpaid invoice together", async () => {
  let savedLines;
  const billing = {
    lockInvoice: async () => ({ version: 1, status: "unpaid", total_amount: "100.00", covered_amount: "0.00", payable_amount: "100.00", bpjs_snapshot: false }),
    invoiceLines: async () => [{ id: "old", room_item_id: "room-item", kind: "item", description: "Old", quantity: 1, unit_price: "100.00", line_total: "100.00" }],
    replaceLines: async (_id, lines) => { savedLines = lines; },
    updateInvoice: async () => {},
    history: async () => {},
  };
  const service = new TagihanUseCases({}, { run: work => work({ billing }) });
  const result = await service.changePayment(actor, "invoice", {
    status: "paid", lines: [{ roomItemId: null, description: "Care", quantity: 1, unitPrice: "50.25" }],
    reason: "Clear item and settle corrected bill", expectedVersion: 1,
  });
  assert.equal(savedLines[0].roomItemId, null);
  assert.equal(result.status, "paid");
  assert.equal(result.payableAmount, "50.25");
});
