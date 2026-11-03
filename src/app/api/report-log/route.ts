import { routing } from '@/i18n/routing';
import { appendReportLog, sheetLogEnabled } from '@/lib/sheet-log';
import { publicOrigin } from '@/lib/site-url';

const RUN_ID = /^[A-Za-z0-9]{8,32}$/;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Logs a finished diagnosis to the Google Sheet; the page calls it once after a crawl succeeds. */
export async function POST(request: Request) {
  if (!sheetLogEnabled()) return new Response(null, { status: 204 });

  const body = (await request.json().catch(() => null)) as { runId?: unknown; link?: unknown; locale?: unknown } | null;
  const runId = str(body?.runId);
  if (!RUN_ID.test(runId)) return Response.json({ error: 'runId không hợp lệ' }, { status: 400 });
  const locale = (routing.locales as readonly string[]).includes(str(body?.locale)) ? str(body?.locale) : routing.defaultLocale;

  // The same address the page shares: /?r=<runId>, /en?r=…, /ja?r=…
  const report = new URL(locale === routing.defaultLocale ? '/' : `/${locale}`, publicOrigin(request));
  report.searchParams.set('r', runId);

  try {
    await appendReportLog({ searchLink: str(body?.link).slice(0, 2000), reportUrl: report.href, createdAt: new Date() });
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error('[report-log]', err);
    return Response.json({ error: 'Không ghi được Google Sheet' }, { status: 502 });
  }
}
