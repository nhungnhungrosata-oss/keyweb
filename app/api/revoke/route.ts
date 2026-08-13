import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminMutation } from "../../lib/admin-auth";
import {
  AppsScriptNonJsonError,
  callAppsScriptMutation,
  checkAppsScriptLicense,
  confirmsRevoke,
  recoveredSuccess,
} from "../../lib/apps-script-admin.mjs";

export async function POST(req: NextRequest) {
  const unauthorized = authorizeAdminMutation(req);
  if (unauthorized) return unauthorized;

  try {
    const { device_key } = await req.json().catch(() => ({}));
    if (!device_key || !String(device_key).trim()) {
      return NextResponse.json({ ok: false, error: "Thiếu device_key" }, { status: 400 });
    }

    const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    const ADMIN_SECRET = process.env.ADMIN_SECRET;

    if (!APPS_SCRIPT_URL) return NextResponse.json({ ok: false, error: "Thiếu ENV APPS_SCRIPT_URL" }, { status: 500 });
    if (!ADMIN_SECRET) return NextResponse.json({ ok: false, error: "Thiếu ENV ADMIN_SECRET" }, { status: 500 });

    let data;
    try {
      data = await callAppsScriptMutation(APPS_SCRIPT_URL, {
        action: "revoke",
        secret: ADMIN_SECRET,
        device_key: String(device_key).trim(),
      });
    } catch (error) {
      if (!(error instanceof AppsScriptNonJsonError)) throw error;

      const verification = await checkAppsScriptLicense(APPS_SCRIPT_URL, device_key);
      if (!confirmsRevoke(verification)) throw error;
      data = recoveredSuccess(
        verification,
        "Đã thu hồi license thành công và xác minh lại trạng thái trên máy chủ.",
      );
    }

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Lỗi server", detail: String(e?.message || e) }, { status: 500 });
  }
}
