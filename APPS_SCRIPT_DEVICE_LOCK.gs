/**
 * Apps Script cho Google Sheet quản lý key + khóa theo thiết bị.
 *
 * Cách dùng:
 * 1) Mở Google Sheet đang lưu key.
 * 2) Extensions > Apps Script.
 * 3) Dán toàn bộ file này vào Code.gs.
 * 4) Project Settings > Script Properties, thêm ADMIN_SECRET giống ENV ADMIN_SECRET trên Vercel.
 * 5) Deploy > New deployment > Web app:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 6) Copy Web app URL đưa vào ENV APPS_SCRIPT_URL trên Vercel.
 */

const SHEET_NAME = 'keys';
const REQUIRED_HEADERS = [
  'device_key',
  'status',
  'app_id',
  'plan',
  'device_id',
  'device_fingerprint',
  'device_name',
  'platform',
  'timezone',
  'user_agent',
  'activated_at',
  'expires_at',
  'note',
  'updated_at'
];

function doGet(e) {
  const params = (e && e.parameter) || {};
  return handleRequest(params);
}

function doPost(e) {
  let body = {};
  try {
    body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};
  } catch (err) {
    body = {};
  }

  const params = Object.assign({}, (e && e.parameter) || {}, body);
  return handleRequest(params);
}

function handleRequest(params) {
  try {
    const action = String(params.action || '').trim();

    if (action === 'check') return json(checkLicense(params));
    if (action === 'activate') return json(activateLicense(params));
    if (action === 'revoke') return json(revokeLicense(params));
    if (action === 'reset_device') return json(resetDevice(params));

    return json({ ok: false, status: 'ERROR', error: 'Action không hợp lệ' });
  } catch (err) {
    return json({ ok: false, status: 'ERROR', error: String(err && err.message ? err.message : err) });
  }
}

function json(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getAdminSecret() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
}

function assertAdmin(params) {
  const secret = getAdminSecret();
  if (!secret) throw new Error('Apps Script thiếu Script Property ADMIN_SECRET');
  if (String(params.secret || '') !== secret) throw new Error('Sai ADMIN_SECRET');
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(REQUIRED_HEADERS);
  }

  const headers = getHeaders(sheet);
  const missing = REQUIRED_HEADERS.filter(h => headers.indexOf(h) === -1);
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }

  return sheet;
}

function getHeaders(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || '').trim());
}

function getColMap(sheet) {
  const headers = getHeaders(sheet);
  const map = {};
  headers.forEach((name, index) => {
    if (name) map[name] = index + 1;
  });
  return map;
}

function findRowByDeviceKey(sheet, deviceKey) {
  const col = getColMap(sheet).device_key;
  if (!col || sheet.getLastRow() < 2) return -1;

  const values = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === deviceKey) return i + 2;
  }
  return -1;
}

function getCell(sheet, row, colMap, name) {
  const col = colMap[name];
  if (!col) return '';
  return sheet.getRange(row, col).getValue();
}

function setCell(sheet, row, colMap, name, value) {
  const col = colMap[name];
  if (!col) return;
  sheet.getRange(row, col).setValue(value);
}

function normalizeDeviceKey(value) {
  return String(value || '').trim();
}

function getIncomingDeviceId(params) {
  return String(params.device_id || params.device_fingerprint || params.fingerprint || '').trim();
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

function computeExpiresAt(plan, customDays) {
  const normalizedPlan = String(plan || '1m');
  if (normalizedPlan === 'forever') return '';

  const now = new Date();
  let days = 30;
  if (normalizedPlan === '2m') days = 60;
  if (normalizedPlan === 'custom') days = Math.max(1, Number(customDays || 0));

  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function activateLicense(params) {
  assertAdmin(params);

  const deviceKey = normalizeDeviceKey(params.device_key);
  if (!deviceKey) return { ok: false, status: 'ERROR', error: 'Thiếu device_key' };

  const sheet = getSheet();
  const colMap = getColMap(sheet);
  let row = findRowByDeviceKey(sheet, deviceKey);

  if (row === -1) {
    row = sheet.getLastRow() + 1;
    setCell(sheet, row, colMap, 'device_key', deviceKey);
  }

  const plan = String(params.plan || '1m');
  const now = new Date();
  setCell(sheet, row, colMap, 'status', 'ACTIVE');
  setCell(sheet, row, colMap, 'app_id', params.app_id || 'veoday');
  setCell(sheet, row, colMap, 'plan', plan);
  setCell(sheet, row, colMap, 'activated_at', getCell(sheet, row, colMap, 'activated_at') || now);
  setCell(sheet, row, colMap, 'expires_at', computeExpiresAt(plan, params.custom_days));
  setCell(sheet, row, colMap, 'note', params.note || getCell(sheet, row, colMap, 'note') || '');
  setCell(sheet, row, colMap, 'updated_at', now);

  return {
    ok: true,
    status: 'ACTIVE',
    message: 'Đã kích hoạt key. Thiết bị đầu tiên mở web sẽ được gắn với key này.',
    data: readLicenseRow(sheet, row, colMap)
  };
}

function checkLicense(params) {
  const deviceKey = normalizeDeviceKey(params.device_key);
  if (!deviceKey) return { ok: false, status: 'ERROR', error: 'Thiếu device_key' };

  const sheet = getSheet();
  const colMap = getColMap(sheet);
  const row = findRowByDeviceKey(sheet, deviceKey);

  if (row === -1) {
    return { ok: false, status: 'INACTIVE', message: 'Không tìm thấy key' };
  }

  const status = String(getCell(sheet, row, colMap, 'status') || '').toUpperCase();
  if (status !== 'ACTIVE') {
    return { ok: false, status: 'INACTIVE', message: 'Key chưa được kích hoạt' };
  }

  const expiresAt = getCell(sheet, row, colMap, 'expires_at');
  if (isExpired(expiresAt)) {
    setCell(sheet, row, colMap, 'status', 'EXPIRED');
    return { ok: false, status: 'EXPIRED', message: 'Key đã hết hạn' };
  }

  const incomingDeviceId = getIncomingDeviceId(params);
  const savedDeviceId = String(getCell(sheet, row, colMap, 'device_id') || '').trim();

  // Nếu web cũ không gửi device_id thì vẫn cho ACTIVE để tránh làm hỏng app cũ.
  if (!incomingDeviceId) {
    return {
      ok: true,
      status: 'ACTIVE',
      message: 'Key hợp lệ',
      data: readLicenseRow(sheet, row, colMap)
    };
  }

  // Gắn key với thiết bị đầu tiên dùng key.
  if (!savedDeviceId) {
    bindDevice(sheet, row, colMap, params, incomingDeviceId);
    return {
      ok: true,
      status: 'ACTIVE',
      message: 'Key hợp lệ. Đã gắn với thiết bị này.',
      data: readLicenseRow(sheet, row, colMap)
    };
  }

  if (savedDeviceId !== incomingDeviceId) {
    return {
      ok: false,
      status: 'DEVICE_MISMATCH',
      device_locked: true,
      message: 'Key đã được kích hoạt trên thiết bị khác',
      bound_device_key: deviceKey,
      data: readLicenseRow(sheet, row, colMap)
    };
  }

  setCell(sheet, row, colMap, 'updated_at', new Date());
  return {
    ok: true,
    status: 'ACTIVE',
    message: 'Key hợp lệ',
    data: readLicenseRow(sheet, row, colMap)
  };
}

function bindDevice(sheet, row, colMap, params, incomingDeviceId) {
  setCell(sheet, row, colMap, 'device_id', incomingDeviceId);
  setCell(sheet, row, colMap, 'device_fingerprint', params.device_fingerprint || params.fingerprint || incomingDeviceId);
  setCell(sheet, row, colMap, 'device_name', params.device_name || '');
  setCell(sheet, row, colMap, 'platform', params.platform || '');
  setCell(sheet, row, colMap, 'timezone', params.timezone || '');
  setCell(sheet, row, colMap, 'user_agent', params.user_agent || '');
  setCell(sheet, row, colMap, 'updated_at', new Date());
}

function revokeLicense(params) {
  assertAdmin(params);

  const deviceKey = normalizeDeviceKey(params.device_key);
  if (!deviceKey) return { ok: false, status: 'ERROR', error: 'Thiếu device_key' };

  const sheet = getSheet();
  const colMap = getColMap(sheet);
  const row = findRowByDeviceKey(sheet, deviceKey);
  if (row === -1) return { ok: false, status: 'INACTIVE', message: 'Không tìm thấy key' };

  setCell(sheet, row, colMap, 'status', 'INACTIVE');
  setCell(sheet, row, colMap, 'updated_at', new Date());

  return { ok: true, status: 'INACTIVE', message: 'Đã thu hồi key', data: readLicenseRow(sheet, row, colMap) };
}

function resetDevice(params) {
  assertAdmin(params);

  const deviceKey = normalizeDeviceKey(params.device_key);
  if (!deviceKey) return { ok: false, status: 'ERROR', error: 'Thiếu device_key' };

  const sheet = getSheet();
  const colMap = getColMap(sheet);
  const row = findRowByDeviceKey(sheet, deviceKey);
  if (row === -1) return { ok: false, status: 'INACTIVE', message: 'Không tìm thấy key' };

  setCell(sheet, row, colMap, 'device_id', '');
  setCell(sheet, row, colMap, 'device_fingerprint', '');
  setCell(sheet, row, colMap, 'device_name', '');
  setCell(sheet, row, colMap, 'platform', '');
  setCell(sheet, row, colMap, 'timezone', '');
  setCell(sheet, row, colMap, 'user_agent', '');
  setCell(sheet, row, colMap, 'updated_at', new Date());

  return {
    ok: true,
    status: String(getCell(sheet, row, colMap, 'status') || 'ACTIVE').toUpperCase(),
    message: 'Đã reset thiết bị. Thiết bị tiếp theo mở web sẽ được gắn lại.',
    data: readLicenseRow(sheet, row, colMap)
  };
}

function readLicenseRow(sheet, row, colMap) {
  const result = {};
  Object.keys(colMap).forEach(name => {
    result[name] = getCell(sheet, row, colMap, name);
  });
  return result;
}
