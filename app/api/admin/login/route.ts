import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  adminCookieOptions,
  createAdminSessionToken,
  credentialsAreValid,
  isSameOrigin,
} from "../../../lib/admin-auth";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ ok: false, error: "Yêu cầu không cùng nguồn" }, { status: 403 });
  }

  const { password } = await req.json().catch(() => ({}));
  if (!credentialsAreValid(String(password || ""))) {
    return NextResponse.json({ ok: false, error: "Mật khẩu quản trị không đúng" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(), adminCookieOptions);
  return response;
}
