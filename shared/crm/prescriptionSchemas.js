// Validates optical prescription relationships and exceptional overrides.

import { z } from "zod";
import { RX_EXCEPTION_LIMITS, RX_LIMITS } from "./constants.js";

const axis = optionalInteger(...RX_EXCEPTION_LIMITS.axis.slice(0, 2));

const eyeSchema = z.object({
  sph: optionalNumeric(...RX_EXCEPTION_LIMITS.sph.slice(0, 2)),
  cyl: optionalNumeric(...RX_EXCEPTION_LIMITS.cyl.slice(0, 2)),
  axis,
  add: optionalNumeric(...RX_EXCEPTION_LIMITS.add.slice(0, 2)),
}).superRefine((eye, context) => {
  if (Number(eye.cyl || 0) !== 0 && eye.axis === undefined) {
    context.addIssue({ code: "custom", path: ["axis"], message: "المحور مطلوب عند وجود CYL." });
  }
});

export const prescriptionSchema = z.object({
  examDate: z.string().date().optional(),
  right: eyeSchema,
  left: eyeSchema,
  pdMode: z.enum(["binocular", "monocular"]),
  binocularPd: optionalInteger(...RX_EXCEPTION_LIMITS.binocularPd.slice(0, 2)),
  rightPd: optionalInteger(...RX_EXCEPTION_LIMITS.monocularPd.slice(0, 2)),
  leftPd: optionalInteger(...RX_EXCEPTION_LIMITS.monocularPd.slice(0, 2)),
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

function optionalInteger(min, max) {
  return z.preprocess(
    (value) => value === "" || value === null || value === undefined ? undefined : Number(value),
    z.number().int("أدخل رقماً صحيحاً بدون كسور.").min(min).max(max).optional(),
  );
}

function outside(value, range) {
  return value !== undefined && (value < range[0] || value > range[1]);
}
