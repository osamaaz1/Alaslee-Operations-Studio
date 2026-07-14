// Verifies shared Saudi customer, optical, and sale validation contracts.

import test from "node:test";
import assert from "node:assert/strict";
import { validateSaudiIdentity, identityType } from "../shared/crm/identity.js";
import { normalizePhone } from "../shared/crm/phone.js";
import { customerCreateSchema } from "../shared/crm/customerSchemas.js";
import { prescriptionSchema, prescriptionExceptional } from "../shared/crm/prescriptionSchemas.js";
import {
  saleCorrectionSchema, saleCreateSchema, saleDeliverySchema, salePaymentSchema, saleRefundSchema,
} from "../shared/crm/saleSchemas.js";

test("Saudi identity and Iqama require ten digits, prefix, and checksum", () => {
  assert.equal(validateSaudiIdentity("1000000008"), true);
  assert.equal(identityType("1000000008"), "national_id");
  assert.equal(validateSaudiIdentity("2000000006"), true);
  assert.equal(identityType("2000000006"), "iqama");
  assert.equal(validateSaudiIdentity("1000000001"), false);
  assert.equal(validateSaudiIdentity("3000000004"), false);
});

test("Saudi phone normalization enforces a valid local mobile", () => {
  assert.equal(normalizePhone({ countryCode: "SA", number: "0501234567" }).e164, "+966501234567");
  assert.throws(() => normalizePhone({ countryCode: "SA", number: "05123" }), /10 أرقام/);
  assert.throws(() => normalizePhone({ countryCode: "SA", number: "phone" }), /الأرقام فقط/);
});

test("customer validation dynamically requires an alternate WhatsApp number", () => {
  const base = { name: "عميل تجريبي", primaryPhone: { countryCode: "SA", number: "0501234567" }, hasWhatsapp: false, sourceCode: "in_store" };
  assert.equal(customerCreateSchema.safeParse(base).success, false);
  const valid = customerCreateSchema.safeParse({ ...base, whatsappPhone: { countryCode: "SA", number: "0551234567" } });
  assert.equal(valid.success, true);
});

test("Saudi national address validates fixed numeric and short-address formats", () => {
  const input = {
    name: "عميل العنوان", primaryPhone: { countryCode: "SA", number: "0501234567" }, hasWhatsapp: true,
    sourceCode: "in_store", address: { countryCode: "SA", buildingNumber: "1234", streetName: "شارع الملك",
      secondaryNumber: "5678", district: "العليا", city: "الرياض", postalCode: "12345", shortAddress: "ABCD1234" },
  };
  assert.equal(customerCreateSchema.safeParse(input).success, true);
  input.address.postalCode = "123";
  assert.equal(customerCreateSchema.safeParse(input).success, false);
});

test("prescription requires axis for non-zero CYL and supports exceptional audit", () => {
  const rx = {
    right: { sph: -1, cyl: -0.5, axis: 90 }, left: { sph: 0, cyl: 0 },
    pdMode: "binocular", binocularPd: 62,
  };
  assert.equal(prescriptionSchema.safeParse(rx).success, true);
  assert.equal(prescriptionExceptional(rx), false);
  assert.equal(prescriptionSchema.safeParse({ ...rx, right: { sph: -1, cyl: -0.5 } }).success, false);
  assert.equal(prescriptionSchema.safeParse({ ...rx, right: { sph: -30, cyl: 7, axis: 180, add: 6 } }).success, true);
  assert.equal(prescriptionSchema.safeParse({ ...rx, right: { sph: -35, cyl: 0 } }).success, false);
  assert.equal(prescriptionSchema.safeParse({ ...rx, right: { sph: -35, cyl: 0 }, exceptionReason: "وصفة معتمدة" }).success, true);
  assert.equal(prescriptionSchema.safeParse({ ...rx, right: { sph: -41, cyl: 0 }, exceptionReason: "خارج النطاق" }).success, false);
  assert.equal(prescriptionSchema.safeParse({ ...rx, binocularPd: 62.5 }).success, false);
});

test("manual sale and correction contracts reject incomplete writes", () => {
  const sale = { customerId: "550e8400-e29b-41d4-a716-446655440000", invoiceNumber: "INV-1001", items: [{ productId: "1", quantity: 1, unitPrice: 500 }] };
  assert.equal(saleCreateSchema.safeParse(sale).success, true);
  assert.equal(saleCreateSchema.safeParse({ ...sale, invoiceNumber: "" }).success, false);
  assert.equal(saleCreateSchema.safeParse({ ...sale, items: [] }).success, false);
  assert.equal(saleCorrectionSchema.safeParse({ action: "edit", reason: "تصحيح" }).success, false);
  assert.equal(saleCorrectionSchema.safeParse({ action: "void", reason: "تصحيح" }).success, true);
});

test("sale fulfillment validates payments, refunds, and scheduled delivery", () => {
  const sale = {
    customerId: "550e8400-e29b-41d4-a716-446655440000",
    invoiceNumber: "INV-1002",
    deliveryMode: "scheduled",
    items: [{ productId: "1", quantity: 1, unitPrice: 500 }],
  };
  assert.equal(saleCreateSchema.safeParse(sale).success, false);
  assert.equal(saleCreateSchema.safeParse({ ...sale, scheduledDeliveryAt: "2030-01-01", initialPaidAmount: 200 }).success, true);
  assert.equal(saleCreateSchema.safeParse({ ...sale, scheduledDeliveryAt: "2030-01-01T12:00:00.000Z", initialPaidAmount: 200 }).success, false);
  assert.equal(saleCreateSchema.safeParse({ ...sale, initialPaidAmount: -1 }).success, false);
  assert.equal(salePaymentSchema.safeParse({ amount: 0 }).success, false);
  assert.equal(salePaymentSchema.safeParse({ amount: 100 }).success, true);
  assert.equal(saleRefundSchema.safeParse({ amount: 100, reason: "" }).success, false);
  assert.equal(saleRefundSchema.safeParse({ amount: 100, reason: "رد للعميل" }).success, true);
  assert.equal(saleDeliverySchema.safeParse({ status: "cancelled" }).success, false);
  assert.equal(saleDeliverySchema.safeParse({ status: "ready", scheduledDeliveryAt: "2030-01-01" }).success, true);
  assert.equal(saleDeliverySchema.safeParse({ status: "ready", scheduledDeliveryAt: "2030-01-01T12:00:00.000Z" }).success, false);
});
