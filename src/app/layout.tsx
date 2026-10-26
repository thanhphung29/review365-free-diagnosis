import type { Metadata } from 'next';
import { Be_Vietnam_Pro, Dancing_Script } from 'next/font/google';
import { config } from '@fortawesome/fontawesome-svg-core';
import '@fortawesome/fontawesome-svg-core/styles.css';
import './globals.css';

// Font Awesome's CSS is imported above; stop it injecting a second copy at runtime.
config.autoAddCss = false;

const sans = Be_Vietnam_Pro({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });
const hand = Dancing_Script({ subsets: ['latin', 'vietnamese'], weight: ['500'], variable: '--font-hand' });

export const metadata: Metadata = {
  title: 'Báo cáo Google Business Profile',
  description: 'Chẩn đoán hồ sơ Google Business Profile theo checklist REVIEW365 từ dữ liệu crawl Apify',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="vi" className={`${sans.variable} ${hand.variable}`}>
      <body>{children}</body>
    </html>
  );
}
