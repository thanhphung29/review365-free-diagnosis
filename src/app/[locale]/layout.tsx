import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Be_Vietnam_Pro, Dancing_Script } from 'next/font/google';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { config } from '@fortawesome/fontawesome-svg-core';
import '@fortawesome/fontawesome-svg-core/styles.css';
import { routing, type Locale } from '@/i18n/routing';
import '../globals.css';

// Font Awesome's CSS is imported above; stop it injecting a second copy at runtime.
config.autoAddCss = false;

/** Absolute base for share-image URLs: the production domain on Vercel, else the local dev server. */
const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'http://localhost:3000';
const OG_LOCALE: Record<Locale, string> = { vi: 'vi_VN', en: 'en_US', ja: 'ja_JP' };

const sans = Be_Vietnam_Pro({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });
const hand = Dancing_Script({ subsets: ['latin', 'vietnamese'], weight: ['500'], variable: '--font-hand' });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const title = t('title');
  const description = t('description');
  // Link previews (Facebook, Zalo, X…). The image comes from ./opengraph-image.tsx.
  // No og:url on purpose: a shared report (?r=…) must stay the link people land on, not the home page.
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    openGraph: { type: 'website', siteName: 'Review365', title, description, locale: OG_LOCALE[locale as Locale] ?? 'vi_VN' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function RootLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale} className={`${sans.variable} ${hand.variable}`}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
