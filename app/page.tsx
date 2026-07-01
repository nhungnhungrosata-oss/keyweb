'use client';

import React, { useState } from 'react';
import { PlanType, ApiResponse } from '../types';

export default function Page() {
  const [deviceKey, setDeviceKey] = useState('');
  const [plan, setPlan] = useState<PlanType>(PlanType.ONE_MONTH);
  const [customDays, setCustomDays] = useState<string>('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const plans = [
    { value: PlanType.ONE_MONTH, label: '1 tháng (1m)' },
    { value: PlanType.TWO_MONTHS, label: '2 tháng (2m)' },
    { value: PlanType.FOREVER, label: 'Vĩnh viễn (forever)' },
    { value: PlanType.CUSTOM, label: 'Tùy nhập (custom)' },
  ];

  const handleApiCall = async (endpoint: string, body: any) => {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      // ✅ Chuẩn hoá response để UI luôn hiểu đúng (Apps Script trả { ok: true/false })
      if (typeof (data as any)?.success === 'boolean') {
        setResult(data);
      } else if (typeof (data as any)?.ok === 'boolean') {
        const ok = (data as any).ok === true;
        setResult({
          success: ok,
          message: ok ? 'Thành công' : ((data as any).error || 'Thất bại'),
          data: data,
          error: ok ? undefined : (data as any).error,
        });
      } else {
        // fallback
        setResult({
          success: response.ok,
          message: response.ok ? 'Thành công' : 'Thất bại',
          data: data,
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: 'Lỗi kết nối đến server',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const onCheck = () => {
    if (!deviceKey.trim()) {
      alert('Vui lòng nhập Device Key');
      return;
    }
    handleApiCall('check', { device_key: deviceKey.trim() });
  };

  const onActivate = () => {
    if (!deviceKey.trim()) {
      alert('Vui lòng nhập Device Key');
      return;
    }
    if (plan === PlanType.CUSTOM) {
      const days = Number(customDays);
      if (!days || days <= 0) {
        alert('Vui lòng nhập số ngày hợp lệ');
        return;
      }
      handleApiCall('activate', {
        device_key: deviceKey.trim(),
        plan,
        custom_days: days,
        note: note || undefined,
      });
      return;
    }

    handleApiCall('activate', {
      device_key: deviceKey.trim(),
      plan,
      note: note || undefined,
    });
  };

  const onRevoke = () => {
    if (!deviceKey.trim()) {
      alert('Vui lòng nhập Device Key');
      return;
    }
    handleApiCall('revoke', { device_key: deviceKey.trim() });
  };

  const onResetDevice = () => {
    if (!deviceKey.trim()) {
      alert('Vui lòng nhập Device Key');
      return;
    }
    if (!confirm('Reset thiết bị cho key này? Key vẫn ACTIVE nhưng sẽ cho phép gắn với thiết bị mới ở lần kiểm tra tiếp theo.')) return;
    handleApiCall('reset-device', { device_key: deviceKey.trim() });
  };

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <h2 style={{ marginBottom: 16 }}>Kích hoạt Key</h2>

      <div style={{ display: 'grid', gap: 12, background: '#fff', padding: 16, borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.08)' }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Device Key</div>
          <input
            value={deviceKey}
            onChange={(e) => setDeviceKey(e.target.value)}
            placeholder="Nhập Device Key"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Gói</div>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as PlanType)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd' }}
            >
              {plans.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {plan === PlanType.CUSTOM && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Số ngày</div>
              <input
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                placeholder="Ví dụ: 15"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd' }}
              />
            </div>
          )}
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Ghi chú</div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú (tuỳ chọn)"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 6 }}>
          <button
            onClick={onCheck}
            disabled={loading}
            style={{ padding: '10px 12px', borderRadius: 10, border: '0', background: '#4b5563', color: '#fff', fontWeight: 700 }}
          >
            Kiểm tra
          </button>
          <button
            onClick={onActivate}
            disabled={loading}
            style={{ padding: '10px 12px', borderRadius: 10, border: '0', background: '#16a34a', color: '#fff', fontWeight: 700 }}
          >
            Kích hoạt
          </button>
          <button
            onClick={onRevoke}
            disabled={loading}
            style={{ padding: '10px 12px', borderRadius: 10, border: '0', background: '#dc2626', color: '#fff', fontWeight: 700 }}
          >
            Thu hồi
          </button>
          <button
            onClick={onResetDevice}
            disabled={loading}
            style={{ padding: '10px 12px', borderRadius: 10, border: '0', background: '#f59e0b', color: '#111827', fontWeight: 700 }}
          >
            Reset thiết bị
          </button>
        </div>

        {result && (
          <div style={{ marginTop: 10, padding: 14, borderRadius: 10, background: result.success ? '#ecfdf5' : '#fef2f2', border: `1px solid ${result.success ? '#86efac' : '#fecaca'}` }}>
            <div style={{ fontWeight: 800, color: result.success ? '#166534' : '#991b1b', marginBottom: 6 }}>
              {result.success ? 'Thành công' : 'Thất bại'}
            </div>
            {result.message && <div style={{ marginBottom: 6 }}>{result.message}</div>}
            {result.data && (
              <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(result.data, null, 2)}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
        Gợi ý: Sau khi bấm kích hoạt, web khách sẽ tự gắn key với thiết bị đầu tiên khi kiểm tra. Nếu khách đổi máy, bấm “Reset thiết bị” để cho phép gắn lại thiết bị mới.
      </div>
    </div>
  );
}
