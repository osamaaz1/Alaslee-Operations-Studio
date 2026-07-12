// Validates Saudi National ID and Iqama numbers with their checksum.

export function validateSaudiIdentity(value) {
  const digits = String(value || "").trim();
  if (!/^[12]\d{9}$/.test(digits)) return false;
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[index]);
    if (index % 2 === 0) {
      const doubled = digit * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sum += digit;
    }
  }
  return sum % 10 === 0;
}

export function identityType(value) {
  const first = String(value || "")[0];
  if (first === "1") return "national_id";
  if (first === "2") return "iqama";
  return null;
}
