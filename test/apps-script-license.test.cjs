const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

class FakeRange {
  constructor(sheet, row, column, rows, columns) {
    Object.assign(this, { sheet, row, column, rows, columns });
  }

  getValues() {
    return Array.from({ length: this.rows }, (_, rowOffset) =>
      Array.from({ length: this.columns }, (_, columnOffset) =>
        this.sheet.data[this.row - 1 + rowOffset]?.[this.column - 1 + columnOffset] ?? '',
      ),
    );
  }

  setValues(values) {
    for (let rowOffset = 0; rowOffset < this.rows; rowOffset += 1) {
      const rowIndex = this.row - 1 + rowOffset;
      if (!this.sheet.data[rowIndex]) this.sheet.data[rowIndex] = [];
      for (let columnOffset = 0; columnOffset < this.columns; columnOffset += 1) {
        this.sheet.data[rowIndex][this.column - 1 + columnOffset] = values[rowOffset][columnOffset];
      }
    }
    return this;
  }
}

class FakeSheet {
  constructor() {
    this.data = [];
  }

  getLastRow() {
    return this.data.reduce(
      (last, row, index) => row?.some((value) => value !== '') ? index + 1 : last,
      0,
    );
  }

  getLastColumn() {
    return Math.max(0, ...this.data.map((row) => row?.length || 0));
  }

  appendRow(values) {
    this.data.push([...values]);
  }

  getRange(row, column, rows = 1, columns = 1) {
    return new FakeRange(this, row, column, rows, columns);
  }
}

function createRuntime() {
  const sheet = new FakeSheet();
  const spreadsheet = {
    getSheetByName: () => sheet,
    insertSheet: () => sheet,
  };
  const context = vm.createContext({
    Array,
    Boolean,
    Date,
    Error,
    JSON,
    Math,
    Number,
    Object,
    String,
    isFinite,
    isNaN,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'test-secret' }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  });
  vm.runInContext(
    fs.readFileSync('APPS_SCRIPT_DEVICE_LOCK.gs', 'utf8'),
    context,
    { filename: 'APPS_SCRIPT_DEVICE_LOCK.gs' },
  );
  return context;
}

test('trial được lưu trên server và giữ một slot ổn định', () => {
  const script = createRuntime();
  const first = script.checkLicense({ device_key: 'IBEGEN-TEST', app_id: 'veoday', installation_id: 'WEB-1' });
  const repeated = script.checkLicense({ device_key: 'IBEGEN-TEST', app_id: 'veoday', installation_id: 'WEB-1' });
  assert.equal(first.status, 'TRIAL');
  assert.equal(repeated.installations_used, 1);
});

test('license cho phép ba trình duyệt và từ chối trình duyệt thứ tư', () => {
  const script = createRuntime();
  script.activateLicense({ device_key: 'IBEGEN-PAID', secret: 'test-secret', plan: 'forever' });
  for (const installation_id of ['WEB-1', 'WEB-2', 'WEB-3']) {
    assert.equal(
      script.checkLicense({ device_key: 'IBEGEN-PAID', app_id: 'veoday', installation_id }).status,
      'ACTIVE',
    );
  }
  const fourth = script.checkLicense({ device_key: 'IBEGEN-PAID', app_id: 'veoday', installation_id: 'WEB-4' });
  assert.equal(fourth.status, 'DEVICE_LIMIT');
  assert.equal(fourth.installations_used, 3);
});

test('gói 1 năm có thời hạn đúng 365 ngày', () => {
  const script = createRuntime();
  const beforeActivation = Date.now();
  const activated = script.activateLicense({
    device_key: 'IBEGEN-ONE-YEAR',
    secret: 'test-secret',
    plan: '1y',
  });
  const afterActivation = Date.now();
  const expiresAt = new Date(activated.data.expires_at).getTime();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;

  assert.equal(activated.data.plan, '1y');
  assert.ok(expiresAt >= beforeActivation + oneYearMs);
  assert.ok(expiresAt <= afterActivation + oneYearMs);
});

test('reset xóa slot nhưng giữ license ACTIVE', () => {
  const script = createRuntime();
  script.activateLicense({ device_key: 'IBEGEN-RESET', secret: 'test-secret', plan: 'forever' });
  for (const installation_id of ['WEB-1', 'WEB-2', 'WEB-3']) {
    script.checkLicense({ device_key: 'IBEGEN-RESET', app_id: 'veoday', installation_id });
  }
  assert.equal(script.resetDevice({ device_key: 'IBEGEN-RESET', secret: 'test-secret' }).status, 'ACTIVE');
  const afterReset = script.checkLicense({ device_key: 'IBEGEN-RESET', app_id: 'veoday', installation_id: 'WEB-4' });
  assert.equal(afterReset.installations_used, 1);
});

test('fingerprint cũ được chuyển đổi mà không tốn thêm slot', () => {
  const script = createRuntime();
  script.activateLicense({ device_key: 'IBEGEN-LEGACY', secret: 'test-secret', plan: 'forever' });
  const sheet = script.getSheet();
  const colMap = script.getColMap(sheet);
  const row = script.findRowByLicenseKey(sheet, 'IBEGEN-LEGACY');
  script.writeFields(sheet, row, colMap, { device_id: 'OLD-FINGERPRINT', installation_ids: '' });

  const migrated = script.checkLicense({
    device_key: 'IBEGEN-LEGACY',
    app_id: 'veoday',
    installation_id: 'WEB-NEW',
    legacy_device_id: 'OLD-FINGERPRINT',
  });
  assert.equal(migrated.status, 'ACTIVE');
  assert.equal(migrated.installations_used, 1);
});
