import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Báo cáo Google Business Profile',
  description: 'Chấm điểm hồ sơ Google Business Profile theo checklist REVIEW365 từ dữ liệu crawl Apify',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
