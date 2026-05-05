import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI City Tours Dashboard',
  description: 'Operator dashboard for AI-guided city tours.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
