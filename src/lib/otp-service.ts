import "server-only";

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

type OtpPurpose = "change" | "forgot";

type OtpChallengePayload = {
  userId: string;
  email: string;
  purpose: OtpPurpose;
  codeHash: string;
  expiresAt: number;
  nonce: string;
};

type VerificationPayload = {
  userId: string;
  email: string;
  purpose: OtpPurpose;
  expiresAt: number;
  nonce: string;
  passwordFingerprint: string;
  gmailFingerprint: string;
};

function secret() {
  return process.env.SESSION_SECRET || "tems-development-secret";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function createSignedToken(payload: Record<string, string | number>) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function readSignedToken<T>(token: string) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const actual = Buffer.from(signature);
  const expected = Buffer.from(sign(encoded));

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString()) as T;
  } catch {
    return null;
  }
}

function hashOtpCode(code: string) {
  return createHmac("sha256", `${secret()}:otp`).update(code).digest("hex");
}

function hashValue(value: string) {
  return createHmac("sha256", `${secret()}:fp`).update(value).digest("hex");
}

export function normalizeRecoveryEmail(value: string) {
  return value.trim().toLowerCase();
}

function mailerConfig() {
  const user = process.env.GMAIL_OTP_USER?.trim();
  const pass = process.env.GMAIL_OTP_APP_PASSWORD?.trim();
  const from = process.env.GMAIL_OTP_FROM?.trim() || user;

  if (!user || !pass || !from) {
    return null;
  }

  return { user, pass, from };
}

function maskEmail(email: string) {
  const [localPart, domain = ""] = email.split("@");
  if (!localPart) return email;
  if (localPart.length <= 2) return `${localPart[0] || "*"}***@${domain}`;
  return `${localPart.slice(0, 2)}***${localPart.slice(-1)}@${domain}`;
}

async function sendWithGmail(email: string, message: string) {
  const config = mailerConfig();
  if (!config) return false;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  await transporter.sendMail({
    from: config.from,
    to: email,
    subject: "รหัส OTP สำหรับ TEMS",
    text: message,
    html: `
      <div style="font-family:Kanit,Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h2 style="margin-bottom:8px">รหัส OTP สำหรับ TEMS</h2>
        <p>รหัสยืนยันของคุณคือ</p>
        <div style="font-size:28px;font-weight:700;letter-spacing:0.35em;color:#1d4ed8;margin:12px 0">${message.match(/\d{6}/)?.[0] || ""}</div>
        <p>รหัสนี้หมดอายุใน 5 นาที</p>
      </div>
    `,
  });

  return true;
}

function gmailProviderConfigured() {
  return Boolean(mailerConfig());
}

export async function issueOtpChallenge(input: { userId: string; email: string; purpose: OtpPurpose }) {
  const code = String(randomInt(100000, 1000000));
  const email = normalizeRecoveryEmail(input.email);
  const message = `รหัส OTP สำหรับ TEMS คือ ${code} (หมดอายุใน 5 นาที)`;
  const delivered = await sendWithGmail(email, message);

  if (!delivered) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Gmail OTP provider is not configured.");
    }
  }

  const payload: OtpChallengePayload = {
    userId: input.userId,
    email,
    purpose: input.purpose,
    codeHash: hashOtpCode(code),
    expiresAt: Date.now() + 5 * 60 * 1000,
    nonce: randomBytes(16).toString("hex"),
  };

  return {
    delivered,
    challengeToken: createSignedToken(payload),
    expiresInSeconds: 5 * 60,
    providerConfigured: gmailProviderConfigured(),
    maskedEmail: maskEmail(email),
  };
}

export function verifyOtpChallenge(input: {
  challengeToken: string;
  code: string;
  expected: { userId: string; email: string; purpose: OtpPurpose };
}) {
  const payload = readSignedToken<OtpChallengePayload>(input.challengeToken);
  if (!payload) return false;
  if (payload.expiresAt < Date.now()) return false;
  if (
    payload.userId !== input.expected.userId ||
    payload.email !== normalizeRecoveryEmail(input.expected.email) ||
    payload.purpose !== input.expected.purpose
  ) {
    return false;
  }

  const actual = Buffer.from(hashOtpCode(input.code));
  const expected = Buffer.from(payload.codeHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createOtpVerificationToken(input: {
  userId: string;
  email: string;
  purpose: OtpPurpose;
  passwordHash: string;
  storedGmail: string;
}) {
  const payload: VerificationPayload = {
    userId: input.userId,
    email: normalizeRecoveryEmail(input.email),
    purpose: input.purpose,
    expiresAt: Date.now() + 10 * 60 * 1000,
    nonce: randomBytes(16).toString("hex"),
    passwordFingerprint: hashValue(input.passwordHash || ""),
    gmailFingerprint: hashValue(normalizeRecoveryEmail(input.storedGmail) || ""),
  };

  return createSignedToken(payload);
}

export function consumeOtpVerificationToken(
  token: string,
  expected: {
    userId: string;
    purpose: OtpPurpose;
    passwordHash: string;
    storedGmail: string;
  },
) {
  const payload = readSignedToken<VerificationPayload>(token);
  if (!payload) return null;
  if (payload.expiresAt < Date.now()) return null;
  if (payload.userId !== expected.userId || payload.purpose !== expected.purpose) return null;
  if (payload.passwordFingerprint !== hashValue(expected.passwordHash || "")) return null;
  if (payload.gmailFingerprint !== hashValue(normalizeRecoveryEmail(expected.storedGmail) || "")) return null;
  return payload;
}

