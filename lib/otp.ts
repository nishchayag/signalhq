import { randomInt } from "crypto";

/** 6-digit one-time code from a CSPRNG (not Math.random). */
export function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

/** Expiry timestamp for a freshly issued code. */
export function otpExpiry(minutes = 5): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}
