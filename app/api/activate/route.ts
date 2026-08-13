import { NextRequest, NextResponse } from "next/server";
import { authorizeAdminMutation } from "../../lib/admin-auth";
import {
  AppsScriptNonJsonError,
  callAppsScriptMutation,
  checkAppsScriptLicense,
  confirmsActivation,
  recoveredSuccess,
} from "../../lib/apps-script-admin.mjs";

export async function POST(req: NextRequest) {
  const unauthorized = authorizeAdminMutation(req);
  if (unauthorized) return unauthorized;

  try {
    const payload = await req.json().catch(() => ({}));
    const { device_key, plan, custom_days, note } = payload;
    const appsScriptPlan = plan === "1y" ? "custom" : plan;
    const appsScriptCustomDays = plan === "1y" ? 365 : custom_days;

    if (!device_key || !String(device_key).trim()) {
      return NextResponse.json({ ok: false, error: "Thiếu device_key" }, { status: 400 });
    }
    if (plan === "custom" && (!custom_days || Number(custom_days) <= 0)) {
      return NextResponse.json({ ok: false, error: "custom_days phải > 0" }, { status: 400 });
    }

    const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    const ADMIN_SECRET = process.env.ADMIN_SECRET;

    if (!APPS_SCRIPT_URL) return NextResponse.json({ ok: false, error: "Thiếu ENV APPS_SCRIPT_URL" }, { status: 500 });
    if (!ADMIN_SECRET) return NextResponse.json({ ok: false, error: "Thiếu ENV ADMIN_SECRET" }, { status: 500 });

    let data;
    try {
      data = await callAppsScriptMutation(APPS_SCRIPT_URL, {
        action: "activate",
        secret: ADMIN_SECRET,
        ...payload,
        device_key: String(device_key).trim(),
        plan: appsScriptPlan,
        custom_days: appsScriptCustomDays,
        max_installations: 3,
        note,
      });
    } catch (error) {
      if (!(error instanceof AppsScriptNonJsonError)) throw error;

      const verification = await checkAppsScriptLicense(APPS_SCRIPT_URL, device_key);
      if (!confirmsActivation(verification, appsScriptPlan, appsScriptCustomDays)) throw error;
      data = recoveredSuccess(
        verification,
        "Đã kích hoạt license thành công và xác minh lại trạng thái trên máy chủ.",
      );
    }

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Lỗi server", detail: String(e?.message || e) }, { status: 500 });
  }
}
