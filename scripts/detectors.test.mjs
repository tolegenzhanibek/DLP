// Run: npm test   (Node >= 22.18 strips TypeScript types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { detect, kzIdChecksumOk, classifyKzId, luhnOk, ibanOk, maxLevel } from "../supabase/functions/_shared/detectors.ts";

test("KZ IIN / BIN checksum", () => {
  assert.equal(kzIdChecksumOk("900105300128"), true);
  assert.equal(kzIdChecksumOk("900105300129"), false);
  assert.equal(classifyKzId("900105300128"), "iin");
  assert.equal(classifyKzId("990540001238"), "bin");
});

test("Luhn and IBAN", () => {
  assert.equal(luhnOk("4111 1111 1111 1111"), true);
  assert.equal(luhnOk("4111 1111 1111 1112"), false);
  assert.equal(ibanOk("GB82 WEST 1234 5698 7654 32"), true);
  assert.equal(ibanOk("GB82 WEST 1234 5698 7654 33"), false);
});

test("plain text is public", () => {
  const r = detect("Компанияның жаңа кеңсесі Алматыда ашылады.");
  assert.equal(r.level, "public");
  assert.equal(r.findings.length, 0);
});

test("IIN and card are confidential, masked and redacted", () => {
  const r = detect("Клиент ЖСН 900105300128, карта 4111 1111 1111 1111, тел +7 701 123 45 67");
  assert.equal(r.level, "confidential");
  const types = r.findings.map((f) => f.type).sort();
  assert.deepEqual(types, ["card", "iin", "phone"]);
  assert.ok(!r.redacted.includes("900105300128"));
  assert.ok(r.redacted.includes("[IIN]") && r.redacted.includes("[CARD]") && r.redacted.includes("[PHONE]"));
  for (const f of r.findings) for (const s of f.samples) assert.match(s, /\*/);
});

test("random 12-digit number is not an IIN", () => {
  assert.equal(detect("Order 900105300129").findings.length, 0);
});

test("secrets are restricted", () => {
  const r = detect("aws key AKIAABCDEFGHIJKLMNOP and\n-----BEGIN RSA PRIVATE KEY-----\nMIIE");
  assert.equal(r.level, "restricted");
  assert.ok(r.categories.includes("credentials"));
});

test("markers in three languages", () => {
  assert.equal(detect("Строго конфиденциально. Отчёт").level, "restricted");
  assert.equal(detect("Құжат құпия").level, "confidential");
  assert.equal(detect("For internal use only").level, "internal");
});

test("policy rules are case-insensitive keywords", () => {
  const r = detect("Status of PROJECT FALCON roadmap", [{ name: "Falcon", keywords: ["project falcon"], level: "restricted" }]);
  assert.equal(r.level, "restricted");
  assert.equal(r.findings[0].rule, "Falcon");
});

test("bulk PII escalates", () => {
  const emails = Array.from({ length: 25 }, (_, i) => `user${i}@mail.kz`).join("\n");
  assert.equal(detect(emails).level, "confidential");
});

test("maxLevel", () => {
  assert.equal(maxLevel("internal", null, "confidential"), "confidential");
});
