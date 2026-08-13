const REQUEST_TIMEOUT_MS = 12_000;
const EXPIRY_TOLERANCE_MS = 15 * 60 * 1000;

export class AppsScriptNonJsonError extends Error {
  constructor(raw, status) {
    super("Apps Script không trả JSON");
    this.name = "AppsScriptNonJsonError";
    this.raw = String(raw || "").slice(0, 200);
    this.status = status;
  }
}

export async function readAppsScriptJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new AppsScriptNonJsonError(text, response.status);
  }
}

function createFormBody(payload) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null || value === "") continue;
    body.set(key, String(value));
  }
  return body;
}

export async function callAppsScriptMutation(url, payload, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: createFormBody(payload),
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await readAppsScriptJson(response);
  if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}`);
  return data;
}

export async function checkAppsScriptLicense(url, deviceKey, fetchImpl = fetch) {
  const checkUrl = new URL(url);
  checkUrl.search = new URLSearchParams({
    action: "check",
    device_key: String(deviceKey || "").trim(),
  }).toString();

  const response = await fetchImpl(checkUrl, {
    method: "GET",
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await readAppsScriptJson(response);
  if (!response.ok) throw new Error(`Apps Script HTTP ${response.status}`);
  return data;
}

function licenseData(response) {
  return response && typeof response.data === "object" ? response.data : response || {};
}

function expiryDays(plan, customDays) {
  if (plan === "1m") return 30;
  if (plan === "2m") return 60;
  if (plan === "1y") return 365;
  if (plan === "custom") return Math.max(1, Number(customDays || 0));
  return null;
}

export function confirmsActivation(response, plan, customDays, now = Date.now()) {
  const data = licenseData(response);
  const status = String(response?.status || data.status || "").toUpperCase();
  if (status !== "ACTIVE" || String(data.plan || "") !== String(plan || "")) return false;

  if (plan === "forever") return !data.expires_at;
  const days = expiryDays(plan, customDays);
  const expiresAt = new Date(data.expires_at).getTime();
  if (!days || !Number.isFinite(expiresAt)) return false;

  const expectedExpiry = now + days * 24 * 60 * 60 * 1000;
  return Math.abs(expiresAt - expectedExpiry) <= EXPIRY_TOLERANCE_MS;
}

export function confirmsRevoke(response) {
  const data = licenseData(response);
  return String(response?.status || data.status || "").toUpperCase() === "INACTIVE";
}

export function confirmsReset(response) {
  const data = licenseData(response);
  const used = response?.installations_used ?? data.installations_used;
  return Number(used) === 0;
}

export function recoveredSuccess(verification, message) {
  return {
    ...verification,
    ok: true,
    message,
    verified_after_html_response: true,
  };
}
