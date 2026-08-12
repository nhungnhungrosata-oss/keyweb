'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { ApiResponse, PlanType } from '../types';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #d1d5db',
  boxSizing: 'border-box',
};

export default function Page() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [deviceKey, setDeviceKey] = useState('');
  const [plan, setPlan] = useState<PlanType>(PlanType.ONE_MONTH);
  const [customDays, setCustomDays] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  useEffect(() => {
    fetch('/api/admin/session', { cache: 'no-store' })
      .then((response) => response.json())
      .then((data) => setAuthenticated(data?.authenticated === true))
      .catch(() => setAuthenticated(false));
  }, []);

  const plans = [
    { value: PlanType.ONE_MONTH, label: '1 tháng' },
    { value: PlanType.TWO_MONTHS, label: '2 tháng' },
    { value: PlanType.FOREVER, label: 'Vĩnh viễn' },
    { value: PlanType.CUSTOM, label: 'Tùy nhập' },
  ];

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setLoginError('');
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok !== true) {
        setLoginError(data?.error || 'Không đăng nhập được');
        return;
      }
      setPassword('');
      setAuthenticated(true);
    } catch {
      setLoginError('Không kết nối được máy chủ');
    } finally {
      setLoading(false);
    }
  };

  const onLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => undefined);
    setAuthenticated(false);
    setResult(null);
  };

  const handleApiCall = async (endpoint: string, body: Record<string, unknown>) => {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setAuthenticated(false);
        setLoginError('Phiên quản trị đã hết hạn. Vui lòng đăng nhập lại.');
        return;
      }

      const success = typeof data?.success === 'boolean' ? data.success : data?.ok === true;
      setResult({
        success,
        message: data?.message || data?.error || (success ? 'Thành công' : 'Thất bại'),
        data,
        error: success ? undefined : data?.error,
      });
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

  const normalizedKey = deviceKey.trim().toUpperCase();
  const requireKey = () => {
    if (normalizedKey) return true;
    alert('Vui lòng nhập mã license');
    return false;
  };

  if (authenticated === null) {
    return <main style={{ padding: 40, fontFamily: 'system-ui, sans-serif' }}>Đang kiểm tra phiên quản trị…</main>;
  }

  if (!authenticated) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, background: '#f1f5f9', fontFamily: 'system-ui, sans-serif' }}>
        <form onSubmit={onLogin} style={{ width: 'min(420px, 100%)', background: '#fff', padding: 24, borderRadius: 16, boxShadow: '0 16px 45px rgba(15,23,42,.12)' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>Quản trị license</h1>
          <p style={{ margin: '0 0 18px', color: '#64748b' }}>Nhập ADMIN_SECRET để tiếp tục.</p>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Mật khẩu quản trị"
            style={inputStyle}
          />
          {loginError && <div style={{ color: '#b91c1c', marginTop: 10 }}>{loginError}</div>}
          <button type="submit" disabled={loading || !password} style={{ width: '100%', marginTop: 14, padding: 11, border: 0, borderRadius: 10, background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 760, margin: '40px auto', padding: 16, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>Quản trị license</h1>
          <div style={{ color: '#64748b', marginTop: 4 }}>Mỗi license dùng tối đa 3 trình duyệt.</div>
        </div>
        <button onClick={onLogout} style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Đăng xuất</button>
      </div>

      <section style={{ display: 'grid', gap: 12, background: '#fff', padding: 18, borderRadius: 14, boxShadow: '0 10px 30px rgba(0,0,0,0.08)' }}>
        <label>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Mã license</div>
          <input value={deviceKey} onChange={(event) => setDeviceKey(event.target.value)} placeholder="IBEGEN-XXXX-XXXX-XXXX" style={inputStyle} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <label>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Gói</div>
            <select value={plan} onChange={(event) => setPlan(event.target.value as PlanType)} style={inputStyle}>
              {plans.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          {plan === PlanType.CUSTOM && (
            <label>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Số ngày</div>
              <input type="number" min="1" value={customDays} onChange={(event) => setCustomDays(event.target.value)} placeholder="Ví dụ: 15" style={inputStyle} />
            </label>
          )}
        </div>

        <label>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Ghi chú</div>
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú (tùy chọn)" style={inputStyle} />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 4 }}>
          <button disabled={loading} onClick={() => requireKey() && handleApiCall('check', { device_key: normalizedKey })} style={buttonStyle('#475569')}>Kiểm tra</button>
          <button disabled={loading} onClick={() => {
            if (!requireKey()) return;
            const days = Number(customDays);
            if (plan === PlanType.CUSTOM && (!days || days <= 0)) return alert('Vui lòng nhập số ngày hợp lệ');
            void handleApiCall('activate', { device_key: normalizedKey, plan, custom_days: plan === PlanType.CUSTOM ? days : undefined, note: note || undefined });
          }} style={buttonStyle('#16a34a')}>Kích hoạt</button>
          <button disabled={loading} onClick={() => requireKey() && confirm('Thu hồi license này?') && handleApiCall('revoke', { device_key: normalizedKey })} style={buttonStyle('#dc2626')}>Thu hồi</button>
          <button disabled={loading} onClick={() => requireKey() && confirm('Reset toàn bộ trình duyệt của license này?') && handleApiCall('reset-device', { device_key: normalizedKey })} style={buttonStyle('#f59e0b', '#111827')}>Reset trình duyệt</button>
        </div>

        {loading && <div style={{ color: '#475569' }}>Đang xử lý…</div>}
        {result && (
          <div style={{ marginTop: 6, padding: 14, borderRadius: 10, background: result.success ? '#ecfdf5' : '#fef2f2', border: `1px solid ${result.success ? '#86efac' : '#fecaca'}` }}>
            <div style={{ fontWeight: 800, color: result.success ? '#166534' : '#991b1b', marginBottom: 6 }}>{result.success ? 'Thành công' : 'Thất bại'}</div>
            {result.message && <div style={{ marginBottom: 6 }}>{result.message}</div>}
            {result.data && <pre style={{ margin: 0, fontSize: 12, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(result.data, null, 2)}</pre>}
          </div>
        )}
      </section>

      <p style={{ fontSize: 13, color: '#64748b' }}>
        Khi đủ 3 trình duyệt hoặc khách đổi máy, bấm “Reset trình duyệt”; license vẫn giữ nguyên thời hạn và trạng thái.
      </p>
    </main>
  );
}

function buttonStyle(background: string, color = '#fff'): React.CSSProperties {
  return { padding: '10px 12px', borderRadius: 10, border: 0, background, color, fontWeight: 700, cursor: 'pointer' };
}
