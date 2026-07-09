import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'StorieD Tours',
    template: '%s · StorieD Tours',
  },
  description:
    'StorieD Tours — self-guided, AI-narrated walking tours of towns, cities and places.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Google Analytics 4 — StorieD (property 537725452) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-K870M6C49G"
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-K870M6C49G');
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
