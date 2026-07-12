// Validates optical prescription relationships and exceptional overrides.

import { z } from "zod";
import { RX_LIMITS } from "./constants.js";

const broadPower = optionalNumeric(-40, 40);
const axis = optionalNumeric(1, 180);

const eyeSchema = z.object({
  sph: broadPower,
  cyl: broadPower,
  axis,
  add: optionalNumeric(0, 8),
}).superRefine((eye, context) => {
  if (Number(eye.cyl || 0) !== 0 && eye.axis === undefined) {
    context.addIssue({ code: "custom", path: ["axis"], message: "المحور مطلوب عند وجود CYL." });
  }
});

export const prescriptionSchema = z.object({
  consent: z.literal(true, { error: "موافقة العميل مطلوبة لحفظ الكشف الطبي." }),
  examDate: z.string().date().optional(),
  right: eyeSchema,
  left: eyeSchema,
  pdMode: z.enum(["binocular", "monocular"]),
  binocularPd: optionalNumeric(10, 100),
  rightPd: optionalNumeric(10, 60),
  leftPd: optionalNumeric(10, 60),
  exceptionReason: z.string().trim().max(300).optional().or(z.literal("")),
}).superRefine((value, context) => {
  validatePd(value, context);
  if (prescriptionExceptional(value) && !value.exceptionReason) {
    context.addIssue({ code: "custom", path: ["exceptionReason"], message: "سبب القيمة الاستثنائية مطلوب." });
  }
});

export function prescriptionExceptional(value) {
  const eyes = [value.right, value.left];
  const eyeExceptional = eyes.some((eye) => outside(eye.sph, RX_LIMITS.sph) || outside(eye.cyl, RX_LIMITS.cyl) || outside(eye.add, RX_LIMITS.add));
  const pdExceptional = value.pdMode === "binocular"
    ? outside(value.binocularPd, RX_LIMITS.binocularPd)
    : outside(value.rightPd, RX_LIMITS.monocularPd) || outside(value.leftPd, RX_LIMITS.monocularPd);
  return eyeExceptional || pdExceptional;
}

function validatePd(value, context) {
  if (value.pdMode === "binocular" && value.binocularPd === undefined) {
    context.addIssue({ code: "custom", path: ["binocularPd"], message: "قيمة IPD مطلوبة." });
  }
  if (value.pdMode === "monocular" && (value.rightPd === undefined || value.leftPd === undefined)) {
    context.addIssue({ code: "custom", path: ["rightPd"], message: "قيمتا PD اليمنى واليسرى مطلوبتان." });
  }
}

function optionalNumeric(min, max) {
  return z.preprocess(
    (value) => value === "" || value === null || value === undefined ? undefined : Number(value),
    z.number().min(min).max(max).optional(),
  );
}

function outside(value, range) {
  return value !== undefined && (value < range[0] || value > range[1]);
}
