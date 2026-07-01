import React from 'react';

export const metadata = {
  title: 'Device Key Manager',
  description: 'Next.js application for managing device keys',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* Using Tailwind CDN as requested to match original styling method */}
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}