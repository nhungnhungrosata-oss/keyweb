import assert from "node:assert/strict";
import test from "node:test";

import {
  AppsScriptNonJsonError,
  callAppsScriptMutation,
  confirmsActivation,
  confirmsReset,
  confirmsRevoke,
  readAppsScriptJson,
} from "../app/lib/apps-script-admin.mjs";

test("phản hồi HTML được nhận diện thay vì báo kết quả JSON sai", async () => {
  const response = new Response("<!DOCTYPE html><html><body>Google error</body></html>", { status: 200 });
  await assert.rejects(() => readAppsScriptJson(response), AppsScriptNonJsonError);
});

test("lệnh quản trị gửi form POST và đọc phản hồi JSON", async () => {
  let captured;
  const result = await callAppsScriptMutation(
    "https://script.google.com/macros/s/test/exec",
    { action: "activate", secret: "secret", device_key: "IBEGEN-TEST" },
    async (_url, options) => {
      captured = options;
      return new Response(JSON.stringify({ ok: true, status: "ACTIVE" }), { status: 200 });
    },
  );

  assert.equal(captured.method, "POST");
  assert.match(captured.headers["Content-Type"], /application\/x-www-form-urlencoded/);
  assert.equal(captured.body.get("action"), "activate");
  assert.equal(captured.body.get("device_key"), "IBEGEN-TEST");
  assert.equal(result.status, "ACTIVE");
});

test("xác minh kích hoạt chỉ thành công khi đúng gói và thời hạn", () => {
  const now = Date.now();
  const response = {
    status: "ACTIVE",
    data: {
      status: "ACTIVE",
      plan: "custom",
      expires_at: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString(),
    },
  };

  assert.equal(confirmsActivation(response, "custom", 365, now), true);
  assert.equal(confirmsActivation(response, "custom", 30, now), false);
});

test("xác minh được trạng thái thu hồi và reset", () => {
  assert.equal(confirmsRevoke({ status: "INACTIVE" }), true);
  assert.equal(confirmsRevoke({ status: "ACTIVE" }), false);
  assert.equal(confirmsReset({ status: "ACTIVE", installations_used: 0 }), true);
  assert.equal(confirmsReset({ status: "ACTIVE", installations_used: 2 }), false);
});
