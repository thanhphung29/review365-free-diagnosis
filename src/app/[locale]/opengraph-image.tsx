import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getTranslations } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from '@/i18n/routing';

// The link preview Facebook, Zalo, X… show for any page of the site, report links included.
export const alt = 'Review365';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** Only the glyphs the image needs, as a TTF from Google Fonts (the old-style CSS API answers with truetype). */
async function googleFont(family: string, weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`)).text();
    const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    return src ? await (await fetch(src)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'meta' });
  const headline = t('ogHeadline');
  const sub = t('ogSub');

  const logo = await readFile(join(process.cwd(), 'public/review-365-logo.png'), 'base64');
  const text = `${headline}${sub}Google Business Profile`;
  // Japanese needs a CJK face; Be Vietnam Pro covers Vietnamese and English.
  const family = locale === 'ja' ? 'Noto+Sans+JP' : 'Be+Vietnam+Pro';
  const [bold, regular] = await Promise.all([googleFont(family, 700, text), googleFont(family, 500, text)]);
  const fonts = [
    ...(bold ? [{ name: 'Brand', data: bold, weight: 700 as const, style: 'normal' as const }] : []),
    ...(regular ? [{ name: 'Brand', data: regular, weight: 500 as const, style: 'normal' as const }] : []),
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: '64px 72px', fontFamily: 'Brand', color: '#fff',
          background: 'radial-gradient(circle at 85% 20%, #1d6b62 0%, #0f3d3b 55%, #0b2e2c 100%)',
        }}
      >
        <img src={`data:image/png;base64,${logo}`} width={336} height={70} alt="" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 30, fontWeight: 500, color: '#7fd6c4' }}>Google Business Profile</div>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.15, maxWidth: 1000 }}>{headline}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 14, height: 14, borderRadius: 999, background: '#e55942' }} />
          <div style={{ fontSize: 30, fontWeight: 500, color: 'rgba(255,255,255,.82)' }}>{sub}</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
