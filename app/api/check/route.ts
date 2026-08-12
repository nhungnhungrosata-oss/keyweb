import { NextRequest, NextResponse } from "next/server";

const ALLOWED_FIELDS = [
  "app_id",
  "device_key",
  "installation_id",
  "device_id",
  "legacy_device_id",
  "device_fingerprint",
  "device_name",
  "platform",
  "language",
  "timezone",
  "screen",
  "user_agent",
] as const;

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

function sanitizePayload(value: unknown): Record<string, string> {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const result: Record<string, string> = {};
  for (const key of ALLOWED_FIELDS) {
    if (source[key] === undefined || source[key] === null) continue;
    result[key] = String(source[key]).trim().slice(0, key === "user_agent" ? 500 : 160);
  }
  return result;
}

async function parseAppsScriptResponse(resp: Response) {
  const text = await resp.text();
  try {
    return { valid: true as const, data: JSON.parse(text) };
  } catch {
    return {
      valid: false as const,
      data: { ok: false, status: "UPSTREAM_ERROR", error: "Apps Script không trả JSON" },
    };
  }
}

function buildQuery(url: string, payload: Record<string, string>) {
  const query = new URLSearchParams({ action: "check", ...payload });
  return `${url}?${query.toString()}`;
}

async function callAppsScript(url: string, payload: Record<string, string>) {
  const body = { action: "check", ...payload };
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const resp = await fetch(`${url}?action=check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify(body),
      });
      const parsed = await parseAppsScriptResponse(resp);
      if (resp.ok && parsed.valid) return parsed.data;
      lastError = new Error(`Apps Script HTTP ${resp.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  // Tương thích với deployment Apps Script cũ chỉ nhận doGet.
  try {
    const resp = await fetch(buildQuery(url, payload), {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const parsed = await parseAppsScriptResponse(resp);
    if (resp.ok && parsed.valid) return parsed.data;
    lastError = new Error(`Apps Script HTTP ${resp.status}`);
  } catch (error) {
    lastError = error;
  }

  throw lastError instanceof Error ? lastError : new Error("Apps Script tạm thời không phản hồi");
}

export async function POST(req: NextRequest) {
  try {
    const payload = sanitizePayload(await req.json().catch(() => ({})));
    if (!payload.device_key) {
      return withCors(
        NextResponse.json({ ok: false, status: "ERROR", error: "Thiếu device_key" }, { status: 400 }),
      );
    }

    const appsScriptUrl = process.env.APPS_SCRIPT_URL;
    if (!appsScriptUrl) {
      return withCors(
        NextResponse.json(
          { ok: false, status: "UPSTREAM_ERROR", temporary: true, error: "Thiếu ENV APPS_SCRIPT_URL" },
          { status: 503 },
        ),
      );
    }

    const data = await callAppsScript(appsScriptUrl, payload);
    return withCors(NextResponse.json(data));
  } catch (error) {
    console.error("[license/check] Apps Script unavailable", error);
    return withCors(
      NextResponse.json(
        {
          ok: false,
          status: "UPSTREAM_ERROR",
          temporary: true,
          error: "Máy chủ bản quyền tạm thời không phản hồi",
        },
        { status: 503 },
      ),
    );
  }
}
