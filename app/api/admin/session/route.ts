import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "../../../lib/admin-auth";

export function GET(req: NextRequest) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value || "";
  return NextResponse.json(
    { authenticated: verifyAdminSessionToken(token) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
