import { ApifyError, startRun } from '@/lib/apify';
import { resolveMapsTarget } from '@/lib/maps-link';
import { MISSING_TOKEN, apifyToken } from '@/lib/token';

/** Start a crawl of one store. Returns at once; the page polls the run. */
export async function POST(request: Request) {
  const token = apifyToken();
  if (!token) return Response.json({ error: MISSING_TOKEN }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const raw = typeof body?.url === 'string' ? body.url : '';
  if (!raw.trim()) return Response.json({ error: 'Hãy dán link Google Maps của cửa hàng' }, { status: 400 });

  const target = await resolveMapsTarget(raw);
  if (!target) {
    return Response.json(
      { error: 'Link không hợp lệ — cần link Google Maps của một địa điểm (google.com/maps/place/…, maps.app.goo.gl/…) hoặc place id' },
      { status: 422 },
    );
  }

  try {
    return Response.json(await startRun(token, target), { status: 202 });
  } catch (err) {
    if (err instanceof ApifyError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
