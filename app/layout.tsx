import React from 'react';

export const metadata = {
  title: 'Quản trị license Veoday',
  description: 'Kích hoạt và quản lý license Veoday',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, background: '#f8fafc', color: '#0f172a' }}>{children}</body>
    </html>
  );
}
