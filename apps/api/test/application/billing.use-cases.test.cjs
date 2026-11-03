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
