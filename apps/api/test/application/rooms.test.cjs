const test = require("node:test");
const assert = require("node:assert/strict");
const { RuangInapUseCases } = require("../../dist/application/rooms/ruang-inap.use-cases");

test("room and equipment writes reject non-coordinators before accessing data", async () => {
  const rooms = new RuangInapUseCases(
    { validatePic: () => assert.fail("unauthorized room access") },
    { run: () => assert.fail("unauthorized transaction") },
  );
  const room = { name: "Melati", roomClass: "I", capacity: 2, status: "available", dailyRate: "125000.25", expectedVersion: 1 };
  const item = { name: "Bed", category: "Facility", quantity: 1, unitPrice: "0.10", expectedVersion: 1 };
  for (const actor of [
    { role: "PERAWAT", coordinator: false },
    { role: "DOKTER", coordinator: false },
    { role: "ADMISI", coordinator: false },
    { role: "DOKTER", coordinator: true },
    { role: "ADMISI", coordinator: true },
  ]) {
    for (const operation of [
      () => rooms.create(actor, room),
      () => rooms.update(actor, "room", room),
      () => rooms.deleteRoom(actor, "room", { expectedVersion: 1 }),
      () => rooms.addItem(actor, "room", item),
      () => rooms.updateItem(actor, "room", "item", item),
      () => rooms.deleteItem(actor, "room", "item", { expectedVersion: 1 }),
    ]) {
      await assert.rejects(operation(), error => error.code === "FORBIDDEN");
    }
  }
});
