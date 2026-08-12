import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const ADMIN_SESSION_COOKIE = "keyweb_admin_session";
const SESSION_DURATION_SECONDS = 12 * 60 * 60;

function getAdminSecret(): string {
  return String(process.env.ADMIN_SECRET || "");
}

function sign(value: string): string {
  return createHmac("sha256", getAdminSecret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function credentialsAreValid(candidate: string): boolean {
  const secret = getAdminSecret();
  return Boolean(secret) && safeEqual(String(candidate || ""), secret);
}

export function createAdminSessionToken(now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(now / 1000) + SESSION_DURATION_SECONDS, v: 1 }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminSessionToken(token: string, now = Date.now()): boolean {
  if (!getAdminSecret()) return false;
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload))) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed?.v === 1 && Number(parsed?.exp) > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function authorizeAdminMutation(req: NextRequest): NextResponse | null {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ ok: false, error: "Yêu cầu không cùng nguồn" }, { status: 403 });
  }

  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value || "";
  if (!verifyAdminSessionToken(token)) {
    return NextResponse.json({ ok: false, error: "Phiên quản trị không hợp lệ" }, { status: 401 });
  }

  return null;
}

export const adminCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_DURATION_SECONDS,
};
