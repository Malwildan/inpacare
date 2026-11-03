const assert = require("node:assert/strict");
const { test } = require("node:test");
const { ValidationPipe } = require("@nestjs/common");
const { UpdateMedicalRecordDto } = require("../../dist/presentation/http/medical-records/dto/medical-record.dto.js");
const { VerifyClaimDto, PaymentDto } = require("../../dist/presentation/http/billing/dto/invoice.dto.js");

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validate = (body, metatype) => pipe.transform(body, { type: "body", metatype });
test("clinical correction requires a submitted reason at the HTTP validation boundary", async () => {
  const input = { expectedVersion: 1, complaint: "Synthetic", diagnosis: "Synthetic", treatment: "Synthetic", recordDate: "2026-11-02" };
  await assert.rejects(validate(input, UpdateMedicalRecordDto));
  const dto = await validate({ ...input, reason: "Correct source entry" }, UpdateMedicalRecordDto);
  assert.equal(dto.reason, "Correct source entry");
});
test("claim verification requires an explicit bounded result rather than only a boolean flag", async () => {
  const input = { expectedVersion: 1, verified: false, reason: "Review" };
  await assert.rejects(validate(input, VerifyClaimDto));
  await assert.rejects(validate({ ...input, result: "a".repeat(121) }, VerifyClaimDto));
  assert.equal((await validate({ ...input, result: "Ditolak" }, VerifyClaimDto)).result, "Ditolak");
});

test("invoice edit fields may be omitted but cannot be null or malformed", async () => {
  const input = { expectedVersion: 1, reason: "Correction" };
  for (const field of ["status", "coveredAmount", "lines"]) {
    await assert.rejects(validate({ ...input, [field]: null }, PaymentDto));
  }
  await assert.rejects(validate({ ...input, coveredAmount: 12.50 }, PaymentDto));
  await assert.rejects(validate({ ...input, lines: [] }, PaymentDto));
  const valid = await validate({ ...input, coveredAmount: "12.50" }, PaymentDto);
  assert.equal(valid.coveredAmount, "12.50");
  assert.equal(valid.status, undefined);
});
