import "server-only";

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

type OtpEntry = { hash: string; phone: string; expiresAt: number; attempts: number };
type VerificationPayload = { userId: string; phone: string; purpose: "change" | "forgot"; expiresAt: number; nonce: string };
const otpEntries = new Map<string, OtpEntry>();
const consumedVerificationTokens = new Set<string>();

function hash(code: string) {
  return createHmac("sha256", process.env.SESSION_SECRET || "tems-development-secret").update(code).digest("hex");
}

export function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("66") && digits.length === 11) digits = `0${digits.slice(2)}`;
  return /^0\d{9}$/.test(digits) ? digits : "";
}

export async function issueOtp(key: string, phone: string) {
  const code = String(randomInt(100000, 1000000));
  otpEntries.set(key, { hash: hash(code), phone, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 });
  const webhook = process.env.SMS_WEBHOOK_URL;
  if (webhook) {
    const authorization = process.env.SMS_WEBHOOK_AUTH_TOKEN?.trim();
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) },
      body: JSON.stringify({ to: phone, sender: process.env.SMS_SENDER_NAME || "TEMS", message: `รหัส OTP สำหรับ TEMS คือ ${code} (หมดอายุใน 5 นาที)` }),
    });
    if (!response.ok) throw new Error("SMS provider rejected the OTP request.");
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("SMS_WEBHOOK_URL is required in production.");
  }
  return { code, delivered: Boolean(webhook) };
}

export function consumeOtp(key: string, code: string, phone: string) {
  const entry = otpEntries.get(key);
  if (!entry || entry.phone !== phone || entry.expiresAt < Date.now() || entry.attempts >= 5) {
    otpEntries.delete(key);
    return false;
  }
  entry.attempts += 1;
  const actual = Buffer.from(hash(code));
  const expected = Buffer.from(entry.hash);
  const valid = actual.length === expected.length && timingSafeEqual(actual, expected);
  if (valid) otpEntries.delete(key);
  return valid;
}

export function createOtpVerificationToken(payload: Omit<VerificationPayload, "expiresAt" | "nonce">) {
  const data: VerificationPayload = { ...payload, expiresAt: Date.now() + 10 * 60 * 1000, nonce: randomBytes(16).toString("hex") };
  const encoded = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${encoded}.${hash(encoded)}`;
}

export function consumeOtpVerificationToken(token: string, expected: { userId: string; purpose: "change" | "forgot" }) {
  if (consumedVerificationTokens.has(token)) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const actual = Buffer.from(signature);
  const expectedSignature = Buffer.from(hash(encoded));
  if (actual.length !== expectedSignature.length || !timingSafeEqual(actual, expectedSignature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as VerificationPayload;
    if (payload.expiresAt < Date.now() || payload.userId !== expected.userId || payload.purpose !== expected.purpose) return null;
    consumedVerificationTokens.add(token);
    return payload;
  } catch {
    return null;
  }
}
