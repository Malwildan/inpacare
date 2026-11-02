const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calculateRoomCost } = require("../../dist/domain/rooms/room-cost");

test("room totals use exact decimal prices and preserve the empty-room response", () => {
  assert.equal(calculateRoomCost([]), "0");
  assert.equal(calculateRoomCost([{ quantity: 3, unitPrice: "0.10" }, { quantity: 2, unitPrice: "0.20" }]), "0.70");
  assert.equal(calculateRoomCost([{ quantity: 10000, unitPrice: "9999999999999.99" }]), "99999999999999900.00");
});
