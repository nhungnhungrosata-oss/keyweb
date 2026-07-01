import { NextRequest, NextResponse } from "next/server";

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

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

function buildQuery(url: string, payload: Record<string, any>) {
  const query = new URLSearchParams();
  query.set("action", "check");
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || typeof value === "object") return;
    query.set(key, String(value));
  });
  return `${url}?${query.toString()}`;
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json().catch(() => ({}));
    const device_key = String(payload?.device_key || "").trim();

    if (!device_key) {
      return withCors(
        NextResponse.json({ ok: false, error: "Thiếu device_key" }, { status: 400 })
      );
    }

    const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    if (!APPS_SCRIPT_URL) {
      return withCors(
        NextResponse.json({ ok: false, error: "Thiếu ENV APPS_SCRIPT_URL" }, { status: 500 })
      );
    }

    const body = {
      action: "check",
      ...payload,
      device_key,
    };

    // Ưu tiên POST để gửi đủ device_id/device_fingerprint/device_name từ web khách.
    let resp = await fetch(`${APPS_SCRIPT_URL}?action=check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(body),
    });
    let data = await parseAppsScriptResponse(resp);

    // Fallback cho Apps Script cũ chỉ hỗ trợ doGet(action=check&device_key=...).
    if (!resp.ok || data?.error === "Apps Script không trả JSON") {
      resp = await fetch(buildQuery(APPS_SCRIPT_URL, body), { cache: "no-store" });
      data = await parseAppsScriptResponse(resp);
    }

    return withCors(NextResponse.json(data, { status: resp.ok ? 200 : 500 }));
  } catch (e: any) {
    return withCors(
      NextResponse.json(
        { ok: false, error: "Lỗi server", detail: String(e?.message || e) },
        { status: 500 }
      )
    );
  }
}
