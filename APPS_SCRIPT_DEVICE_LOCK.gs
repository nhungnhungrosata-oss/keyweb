/**
 * Apps Script quản lý license Veoday.
 *
 * Chính sách:
 * - 1 license dùng tối đa 3 trình duyệt/cài đặt.
 * - installation_id là mã ngẫu nhiên ổn định của từng trình duyệt.
 * - Fingerprint chỉ để hiển thị/chẩn đoán, không dùng để khóa.
 * - Trial 3 ngày được lưu trên Google Sheet thay vì chỉ ở localStorage.
 * - LockService ngăn hai trình duyệt cùng chiếm slot vượt giới hạn.
 *
 * Deploy dưới dạng Web app:
 * - Execute as: Me
 * - Who has access: Anyone
 * - Script Property ADMIN_SECRET phải giống ENV ADMIN_SECRET trên Vercel.
 */

const SHEET_NAME = 'keys';
const DEFAULT_APP_ID = 'veoday';
const DEFAULT_MAX_INSTALLATIONS = 3;
const TRIAL_DURATION_DAYS = 3;
const REQUIRED_HEADERS = [
  'device_key',
  'status',
  'app_id',
  'plan',
  'max_installations',
  'installation_ids',
  'device_id',
  'device_fingerprint',
  'device_name',
  'platform',
  'timezone',
  'user_agent',
  'activated_at',
  'expires_at',
  'trial_started_at',
  'trial_expires_at',
  'note',
  'updated_at'
];

function doGet(e) {
  return handleRequest((e && e.parameter) || {});
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

  return handleRequest(Object.assign({}, (e && e.parameter) || {}, body));
}

function handleRequest(params) {
  try {
    const action = String(params.action || '').trim();
    if (action === 'check') return json(withLock(function () { return checkLicense(params); }));
    if (action === 'activate') return json(withLock(function () { return activateLicense(params); }));
    if (action === 'revoke') return json(withLock(function () { return revokeLicense(params); }));
    if (action === 'reset_device') return json(withLock(function () { return resetDevice(params); }));
    return json({ ok: false, status: 'ERROR', error: 'Action không hợp lệ' });
  } catch (err) {
    return json({
      ok: false,
      status: 'ERROR',
      error: String(err && err.message ? err.message : err)
    });
  }
}

function withLock(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
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
  if (sheet.getLastRow() === 0) sheet.appendRow(REQUIRED_HEADERS);

  const headers = getHeaders(sheet);
  const missing = REQUIRED_HEADERS.filter(function (name) { return headers.indexOf(name) === -1; });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
  return sheet;
}

function getHeaders(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (value) {
    return String(value || '').trim();
  });
}

function getColMap(sheet) {
  const map = {};
  getHeaders(sheet).forEach(function (name, index) {
    if (name) map[name] = index + 1;
  });
  return map;
}

function normalizeLicenseKey(value) {
  return String(value || '').trim().toUpperCase();
}

function findRowByLicenseKey(sheet, deviceKey) {
  const col = getColMap(sheet).device_key;
  if (!col || sheet.getLastRow() < 2) return -1;

  const target = normalizeLicenseKey(deviceKey);
  const values = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues();
  for (let index = 0; index < values.length; index += 1) {
    if (normalizeLicenseKey(values[index][0]) === target) return index + 2;
  }
  return -1;
}

function readRow(sheet, row, colMap) {
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const result = {};
  Object.keys(colMap).forEach(function (name) {
    result[name] = values[colMap[name] - 1];
  });
  return result;
}

function writeFields(sheet, row, colMap, fields) {
  const width = sheet.getLastColumn();
  const values = row <= sheet.getLastRow()
    ? sheet.getRange(row, 1, 1, width).getValues()[0]
    : new Array(width).fill('');

  Object.keys(fields).forEach(function (name) {
    if (colMap[name]) values[colMap[name] - 1] = fields[name];
  });
  sheet.getRange(row, 1, 1, width).setValues([values]);
}

function getIncomingInstallationId(params) {
  return String(
    params.installation_id || params.device_id || params.device_fingerprint || params.fingerprint || ''
  ).trim().slice(0, 160);
}

function getMaxInstallations(value) {
  const parsed = Math.floor(Number(value || DEFAULT_MAX_INSTALLATIONS));
  if (!isFinite(parsed)) return DEFAULT_MAX_INSTALLATIONS;
  return Math.min(10, Math.max(1, parsed));
}

function parseInstallationIds(value) {
  let values = [];
  if (Array.isArray(value)) {
    values = value;
  } else {
    const text = String(value || '').trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      values = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      values = text.split(/[;,\n]/);
    }
  }

  const unique = [];
  values.forEach(function (item) {
    const id = String(item || '').trim();
    if (id && unique.indexOf(id) === -1) unique.push(id);
  });
  return unique;
}

function isExpired(value) {
  if (!value) return false;
  const date = new Date(value);
  return !isNaN(date.getTime()) && date.getTime() <= Date.now();
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function computeExpiresAt(plan, customDays) {
  const normalizedPlan = String(plan || '1m');
  if (normalizedPlan === 'forever') return '';
  let days = 30;
  if (normalizedPlan === '2m') days = 60;
  if (normalizedPlan === 'custom') days = Math.max(1, Number(customDays || 0));
  return addDays(new Date(), days);
}

function publicLicenseData(data) {
  const installations = parseInstallationIds(data.installation_ids);
  return {
    device_key: data.device_key || '',
    status: String(data.status || '').toUpperCase(),
    app_id: data.app_id || '',
    plan: data.plan || '',
    expires_at: data.expires_at || '',
    trial_started_at: data.trial_started_at || '',
    trial_expires_at: data.trial_expires_at || '',
    installations_used: installations.length,
    max_installations: getMaxInstallations(data.max_installations)
  };
}

function metadataFields(params, installationId) {
  return {
    device_id: installationId,
    device_fingerprint: String(params.device_fingerprint || params.fingerprint || '').slice(0, 160),
    device_name: String(params.device_name || '').slice(0, 160),
    platform: String(params.platform || '').slice(0, 160),
    timezone: String(params.timezone || '').slice(0, 160),
    user_agent: String(params.user_agent || '').slice(0, 500),
    updated_at: new Date()
  };
}

function registerInstallation(sheet, row, colMap, data, params, installationId) {
  const maxInstallations = getMaxInstallations(data.max_installations);
  let installations = parseInstallationIds(data.installation_ids);
  let migratedLegacyInstallation = false;

  // Chuyển bản ghi 1 thiết bị cũ sang installation_id mới mà không tốn thêm slot.
  const legacySavedId = String(data.device_id || '').trim();
  if (!installations.length && legacySavedId) {
    // Bản cũ dùng fingerprint dễ đổi sau khi cập nhật trình duyệt. Lần kiểm tra đầu tiên
    // của client mới thay fingerprint đó bằng installation_id ổn định, không cộng thêm slot.
    installations = [installationId || legacySavedId];
    migratedLegacyInstallation = Boolean(installationId);
  }

  if (!installationId) {
    return { allowed: true, installations: installations, max: maxInstallations };
  }
  if (installations.indexOf(installationId) !== -1) {
    if (migratedLegacyInstallation) {
      const migratedFields = metadataFields(params, installationId);
      migratedFields.installation_ids = JSON.stringify(installations);
      migratedFields.max_installations = maxInstallations;
      writeFields(sheet, row, colMap, migratedFields);
    }
    return { allowed: true, installations: installations, max: maxInstallations };
  }
  if (installations.length >= maxInstallations) {
    return { allowed: false, installations: installations, max: maxInstallations };
  }

  installations.push(installationId);
  const fields = metadataFields(params, installationId);
  fields.installation_ids = JSON.stringify(installations);
  fields.max_installations = maxInstallations;
  writeFields(sheet, row, colMap, fields);
  return { allowed: true, installations: installations, max: maxInstallations };
}

function activationResponse(data, registration, message) {
  const publicData = publicLicenseData(data);
  publicData.installations_used = registration.installations.length;
  publicData.max_installations = registration.max;
  return {
    ok: true,
    status: String(data.status || 'ACTIVE').toUpperCase(),
    message: message,
    installations_used: registration.installations.length,
    max_installations: registration.max,
    data: publicData
  };
}

function createTrial(sheet, colMap, params, deviceKey, installationId) {
  const now = new Date();
  const row = sheet.getLastRow() + 1;
  const installations = installationId ? [installationId] : [];
  const fields = Object.assign(metadataFields(params, installationId), {
    device_key: deviceKey,
    status: 'TRIAL',
    app_id: params.app_id || DEFAULT_APP_ID,
    plan: 'trial',
    max_installations: DEFAULT_MAX_INSTALLATIONS,
    installation_ids: JSON.stringify(installations),
    trial_started_at: now,
    trial_expires_at: addDays(now, TRIAL_DURATION_DAYS),
    updated_at: now
  });
  writeFields(sheet, row, colMap, fields);

  const data = readRow(sheet, row, colMap);
  return {
    ok: true,
    status: 'TRIAL',
    trial_active: true,
    message: 'Đang trong thời gian dùng thử 3 ngày',
    installations_used: installations.length,
    max_installations: DEFAULT_MAX_INSTALLATIONS,
    data: publicLicenseData(data)
  };
}

function checkLicense(params) {
  const deviceKey = normalizeLicenseKey(params.device_key);
  if (!deviceKey) return { ok: false, status: 'ERROR', error: 'Thiếu device_key' };

  const installationId = getIncomingInstallationId(params);
  const sheet = getSheet();
  const colMap = getColMap(sheet);
  const row = findRowByLicenseKey(sheet, deviceKey);

  if (row === -1) {
    // Lệnh kiểm tra từ trang admin không có installation_id thì không tự tạo trial.
    if (!installationId) return { ok: false, status: 'INACTIVE', message: 'Không tìm thấy license' };
    return createTrial(sheet, colMap, params, deviceKey, installationId);
  }

  let data = readRow(sheet, row, colMap);
  const savedAppId = String(data.app_id || '').trim();
  const incomingAppId = String(params.app_id || '').trim();
  if (savedAppId && incomingAppId && savedAppId !== incomingAppId) {
    return { ok: false, status: 'APP_MISMATCH', message: 'License không thuộc ứng dụng này' };
  }

  const status = String(data.status || '').toUpperCase();
  if (status === 'ACTIVE' && isExpired(data.expires_at)) {
    writeFields(sheet, row, colMap, { status: 'EXPIRED', updated_at: new Date() });
    data.status = 'EXPIRED';
    return { ok: false, status: 'EXPIRED', message: 'License đã hết hạn', data: publicLicenseData(data) };
  }
  if (status === 'TRIAL' && isExpired(data.trial_expires_at)) {
    writeFields(sheet, row, colMap, { status: 'TRIAL_EXPIRED', updated_at: new Date() });
    data.status = 'TRIAL_EXPIRED';
    return { ok: false, status: 'TRIAL_EXPIRED', message: 'Thời gian dùng thử đã kết thúc', data: publicLicenseData(data) };
  }
  if (status !== 'ACTIVE' && status !== 'TRIAL') {
    return {
      ok: false,
      status: status || 'INACTIVE',
      message: status === 'EXPIRED' ? 'License đã hết hạn' : 'License chưa được kích hoạt',
      data: publicLicenseData(data)
    };
  }

  const registration = registerInstallation(sheet, row, colMap, data, params, installationId);
  if (!registration.allowed) {
    return {
      ok: false,
      status: 'DEVICE_LIMIT',
      device_locked: true,
      message: 'License đã đủ ' + registration.max + ' trình duyệt. Vui lòng liên hệ admin để reset.',
      installations_used: registration.installations.length,
      max_installations: registration.max,
      data: publicLicenseData(data)
    };
  }

  data = readRow(sheet, row, colMap);
  if (status === 'TRIAL') {
    const response = activationResponse(data, registration, 'Đang trong thời gian dùng thử 3 ngày');
    response.trial_active = true;
    return response;
  }
  return activationResponse(data, registration, 'License hợp lệ');
}

function activateLicense(params) {
  assertAdmin(params);
  const deviceKey = normalizeLicenseKey(params.device_key);
  if (!deviceKey) return { ok: false, status: 'ERROR', error: 'Thiếu device_key' };

  const sheet = getSheet();
  const colMap = getColMap(sheet);
  let row = findRowByLicenseKey(sheet, deviceKey);
  if (row === -1) row = sheet.getLastRow() + 1;

  const existing = row <= sheet.getLastRow() ? readRow(sheet, row, colMap) : {};
  const plan = String(params.plan || '1m');
  const now = new Date();
  writeFields(sheet, row, colMap, {
    device_key: deviceKey,
    status: 'ACTIVE',
    app_id: params.app_id || existing.app_id || DEFAULT_APP_ID,
    plan: plan,
    max_installations: getMaxInstallations(params.max_installations || existing.max_installations),
    installation_ids: existing.installation_ids || '[]',
    activated_at: now,
    expires_at: computeExpiresAt(plan, params.custom_days),
    note: params.note || existing.note || '',
    updated_at: now
  });

  const data = readRow(sheet, row, colMap);
  return {
    ok: true,
    status: 'ACTIVE',
    message: 'Đã kích hoạt license, tối đa ' + getMaxInstallations(data.max_installations) + ' trình duyệt.',
    data: data
  };
}

function revokeLicense(params) {
  assertAdmin(params);
  const deviceKey = normalizeLicenseKey(params.device_key);
  if (!deviceKey) return { ok: false, status: 'ERROR', error: 'Thiếu device_key' };

  const sheet = getSheet();
  const colMap = getColMap(sheet);
  const row = findRowByLicenseKey(sheet, deviceKey);
  if (row === -1) return { ok: false, status: 'INACTIVE', message: 'Không tìm thấy license' };

  writeFields(sheet, row, colMap, { status: 'INACTIVE', updated_at: new Date() });
  return { ok: true, status: 'INACTIVE', message: 'Đã thu hồi license', data: readRow(sheet, row, colMap) };
}

function resetDevice(params) {
  assertAdmin(params);
  const deviceKey = normalizeLicenseKey(params.device_key);
  if (!deviceKey) return { ok: false, status: 'ERROR', error: 'Thiếu device_key' };

  const sheet = getSheet();
  const colMap = getColMap(sheet);
  const row = findRowByLicenseKey(sheet, deviceKey);
  if (row === -1) return { ok: false, status: 'INACTIVE', message: 'Không tìm thấy license' };

  writeFields(sheet, row, colMap, {
    installation_ids: '[]',
    device_id: '',
    device_fingerprint: '',
    device_name: '',
    platform: '',
    timezone: '',
    user_agent: '',
    updated_at: new Date()
  });
  const data = readRow(sheet, row, colMap);
  return {
    ok: true,
    status: String(data.status || 'ACTIVE').toUpperCase(),
    message: 'Đã reset toàn bộ trình duyệt. Tối đa 3 trình duyệt có thể đăng ký lại.',
    data: data
  };
}
