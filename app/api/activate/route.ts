import { NextRequest, NextResponse } from "next/server";

async function parseAppsScriptResponse(resp: Response) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "Apps Script không trả JSON",
      raw: text.slice(0, 200),
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({}));
    const { device_key, plan, custom_days, note } = payload;

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

    const resp = await fetch(`${APPS_SCRIPT_URL}?action=activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        action: "activate",
        secret: ADMIN_SECRET,
        ...payload,
        device_key: String(device_key).trim(),
        plan,
        custom_days,
        note,
      }),
    });

    const data = await parseAppsScriptResponse(resp);
    return NextResponse.json(data, { status: resp.ok ? 200 : 500 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Lỗi server", detail: String(e?.message || e) }, { status: 500 });
  }
}
