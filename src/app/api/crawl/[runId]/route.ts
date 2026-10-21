import { ApifyError, getItems, getRun } from '@/lib/apify';
import { MISSING_TOKEN, apifyToken } from '@/lib/token';

const RUN_ID = /^[A-Za-z0-9]{8,32}$/;

/** Run status; once it has succeeded, the crawled items come along. */
export async function GET(_request: Request, ctx: RouteContext<'/api/crawl/[runId]'>) {
  const token = apifyToken();
  if (!token) return Response.json({ error: MISSING_TOKEN }, { status: 503 });

  const { runId } = await ctx.params;
  if (!RUN_ID.test(runId)) return Response.json({ error: 'runId không hợp lệ' }, { status: 404 });

  try {
    const run = await getRun(token, runId);
    const { datasetId, ...rest } = run;
    if (run.status !== 'SUCCEEDED') return Response.json(rest);
    return Response.json({ ...rest, items: await getItems(token, datasetId) });
  } catch (err) {
    if (err instanceof ApifyError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

