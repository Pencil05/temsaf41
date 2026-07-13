import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "tems-session";

export type SessionUser = {
  userId: string;
  companyId: string;
  email: string;
  role: "Admin" | "User";
  rank: string;
  firstName: string;
  lastName: string;
};

type SessionPayload = SessionUser & { expiresAt: number };

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET || "dev-session-secret";
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

export function createSessionValue(user: SessionUser) {
  const payload: SessionPayload = {
    ...user,
    expiresAt: Date.now() + 1000 * 60 * 60 * 8,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function readSessionValue(value?: string): SessionUser | null {
  if (!value) {
    return null;
  }

  const [encodedPayload, signature] = value.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const suppliedSignature = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);

  if (
    suppliedSignature.length !== expectedSignatureBuffer.length ||
    !timingSafeEqual(suppliedSignature, expectedSignatureBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString()) as SessionPayload;

    if (payload.expiresAt < Date.now()) {
      return null;
    }

    return {
      userId: payload.userId,
      companyId: payload.companyId,
      email: payload.email,
      role: payload.role,
      rank: payload.rank,
      firstName: payload.firstName,
      lastName: payload.lastName,
    };
  } catch {
    return null;
  }
}
