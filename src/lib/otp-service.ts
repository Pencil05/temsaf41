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

function thailandE164(phone: string) {
  return `+66${phone.slice(1)}`;
}

async function sendWithTwilio(phone: string, message: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid && !authToken && !fromNumber) return false;
  if (!accountSid || !authToken || !fromNumber) throw new Error("Twilio SMS configuration is incomplete.");

  const body = new URLSearchParams({ To: thailandE164(phone), From: fromNumber, Body: message });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!response.ok) throw new Error("Twilio rejected the OTP request.");
  return true;
}

export async function issueOtp(key: string, phone: string) {
  const code = String(randomInt(100000, 1000000));
  otpEntries.set(key, { hash: hash(code), phone, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 });
  const webhook = process.env.SMS_WEBHOOK_URL;
  const message = `รหัส OTP สำหรับ TEMS คือ ${code} (หมดอายุใน 5 นาที)`;
  let delivered = false;
  if (webhook) {
    const authorization = process.env.SMS_WEBHOOK_AUTH_TOKEN?.trim();
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}) },
      body: JSON.stringify({ to: phone, sender: process.env.SMS_SENDER_NAME || "TEMS", message }),
    });
    if (!response.ok) throw new Error("SMS provider rejected the OTP request.");
    delivered = true;
  } else {
    delivered = await sendWithTwilio(phone, message);
  }
  if (!delivered && process.env.NODE_ENV === "production") {
    throw new Error("An SMS provider is required in production.");
  }
  return { code, delivered };
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
