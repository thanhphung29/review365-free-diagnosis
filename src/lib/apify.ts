// Server-only client for the Apify Google Maps Scraper.
// The run is started and then polled, never waited on in one request: a crawl
// takes 30s–2min and a single long request would hit serverless timeouts.

import type { MapsTarget } from './maps-link';

const BASE = 'https://api.apify.com/v2';
export const ACTOR_ID = process.env.APIFY_ACTOR_ID || 'compass~crawler-google-places';
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);

export class ApifyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

interface ApifyRun {
  id: string;
  status: string;
  defaultDatasetId: string;
  startedAt?: string;
  finishedAt?: string | null;
}

/**
 * The cheapest input that still feeds every measurable criterion: one place,
 * its detail page (hours, popular times, star distribution, owner posts), and
 * the single newest review (review frequency) — no images, no contacts enrichment.
 */
function buildInput(target: Exclude<MapsTarget, { kind: 'short' }>) {
  return {
    ...(target.kind === 'placeId' ? { placeIds: [target.placeId] } : { startUrls: [{ url: target.url }] }),
    language: 'vi',
    maxCrawledPlacesPerSearch: 1,
    scrapePlaceDetailPage: true,
    maxReviews: 1,
    reviewsSort: 'newest',
    maxImages: 0,
    maxQuestions: 0,
    scrapeImageAuthors: false,
    scrapeReviewsPersonalData: false,
    includeWebResults: false,
    scrapeDirectories: false,
    scrapeContacts: false,
    scrapeOrderOnline: false,
    scrapeTableReservationProvider: false,
    maximumLeadsEnrichmentRecords: 0,
  };
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ApifyError('Không kết nối được tới Apify', 502);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    const detail = body?.error?.message;
    if (res.status === 401) throw new ApifyError('APIFY_TOKEN trên server không hợp lệ', 502);
    if (res.status === 402 || res.status === 403) throw new ApifyError(`Apify từ chối: ${detail ?? 'hết credit hoặc vượt giới hạn tài khoản'}`, 402);
    if (res.status === 404) throw new ApifyError('Không tìm thấy lần crawl trên Apify', 404);
    throw new ApifyError(`Apify lỗi ${res.status}${detail ? `: ${detail}` : ''}`, 502);
  }
  return (await res.json()) as T;
}

export interface RunView {
  runId: string;
  status: string;
  done: boolean;
}

const view = (run: ApifyRun): RunView => ({
  runId: run.id,
  status: run.status,
  done: TERMINAL.has(run.status),
});

export async function startRun(token: string, target: Exclude<MapsTarget, { kind: 'short' }>): Promise<RunView> {
  const { data } = await call<{ data: ApifyRun }>(token, `/acts/${ACTOR_ID}/runs`, {
    method: 'POST',
    body: JSON.stringify(buildInput(target)),
  });
  return view(data);
}

export async function getRun(token: string, runId: string): Promise<RunView & { datasetId: string }> {
  const { data } = await call<{ data: ApifyRun }>(token, `/actor-runs/${encodeURIComponent(runId)}`);
  return { ...view(data), datasetId: data.defaultDatasetId };
}

export async function getItems(token: string, datasetId: string): Promise<Record<string, unknown>[]> {
  return call<Record<string, unknown>[]>(token, `/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`);
}
