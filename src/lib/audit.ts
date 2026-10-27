// GBP audit — scores one Apify Google Maps item against the REVIEW365 checklist.
// Pure functions only: runs the same in the browser and on the server.

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E';
export type CheckStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'UNAVAILABLE';
export type GroupKey = 'basic' | 'posts' | 'photos' | 'reviews';

export interface Check {
  key: string;
  title: string;
  desc: string;
  status: CheckStatus;
  measure: string;
  fix: string;
}

export interface Group {
  key: GroupKey;
  name: string;
  checks: Check[];
  passed: number;
  measured: number;
  total: number;
  grade: Grade | null;
}

export interface Audit {
  name: string;
  category: string | null;
  address: string | null;
  url: string | null;
  ref: Date;
  scraped: Date | null;
  rating: number | null;
  reviewCount: number | null;
  /** Star counts, 5★ first. */
  dist: number[] | null;
  groups: Group[];
  passed: number;
  measured: number;
  overall: Grade | null;
  coverage: { detailPage: boolean; images: number };
}

/** An Apify Google Maps dataset item; only the fields read below matter. */
export type Place = Record<string, unknown>;

// ── Checklist definition (REVIEW365, 20 items) ─────────────────────────────
// Criteria the public crawl can only approximate are reported as unmeasurable (see Review365_Analysis_1_Store.xlsx).
// Every user-facing string comes from the locale messages (messages/*.json): groups.*, checks.<key>.*, measure.*.
const GROUP_KEYS: GroupKey[] = ['basic', 'posts', 'photos', 'reviews'];

/** The 20 criteria, in report order. */
export const CHECK_KEYS = [
  'name', 'category', 'description', 'openingDate', 'address', 'hours', 'hoursAccuracy', 'services', 'website', 'phone',
  'postFreq', 'postKw',
  'photoCount', 'photoFreq', 'logo',
  'avg', 'count', 'reviewFreq', 'replyKw', 'replyRate',
] as const;

/** A message lookup, e.g. next-intl's `t`; keeps this module free of any i18n library. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** A store whose newest review is older than this is not getting reviews often enough. */
const REVIEW_FRESH_DAYS = 30;

// ── Helpers ─────────────────────────────────────────────────────────────────
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.normalize('NFC') : null);
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const date = (v: unknown) => { const s = str(v); if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d; };
const days = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));

function grade(passed: number, measured: number): Grade | null {
  if (!measured) return null;
  const r = passed / measured;
  return r >= 1 ? 'A' : r >= 0.8 ? 'B' : r >= 0.6 ? 'C' : r >= 0.4 ? 'D' : 'E';
}

interface CheckOpts { unavailable?: boolean; measurable?: boolean; measure?: string }

// ── Audit ───────────────────────────────────────────────────────────────────
export function audit(p: Place, t: Translate): Audit {
  const ref = date(p.scrapedAt) || new Date();
  const name = str(p.title) || t('measure.noName');
  const category = str(p.categoryName) || str(arr(p.categories)[0]);
  const nb = str(p.neighborhood), city = str(p.city);
  const rating = num(p.totalScore), reviewCount = num(p.reviewsCount);
  const distRaw = rec(p.reviewsDistribution);
  const dist = distRaw ? [5, 4, 3, 2, 1].map((s) => num(distRaw[['', 'oneStar', 'twoStar', 'threeStar', 'fourStar', 'fiveStar'][s]]) || 0) : null;
  const hours = arr(p.openingHours).filter(rec);
  const hist = rec(p.popularTimesHistogram);
  const description = str(p.description) || str(p.ownerDescription);
  const detailPage = hours.length > 0 || !!rec(p.additionalInfo) || !!hist || !!distRaw || !!description;
  const images = arr(p.images).filter((i) => rec(i) && date(rec(i)!.uploadedAt));

  const C = (key: (typeof CHECK_KEYS)[number], ok: boolean, opts: CheckOpts = {}): Check => ({
    key,
    title: t(`checks.${key}.title`),
    desc: t(`checks.${key}.desc`, { days: REVIEW_FRESH_DAYS }),
    status: opts.unavailable ? 'UNAVAILABLE' : opts.measurable === false ? 'UNKNOWN' : ok ? 'PASS' : 'FAIL',
    measure: opts.measure || '',
    fix: t(`checks.${key}.fix`),
  });
  const NEED_DETAIL = t('measure.needDetail');

  // Basic
  const street = str(p.street), address = str(p.address);

  const basic = [
    C('name', false, { unavailable: true, measure: t('measure.nameKw') }),
    C('category', !!category, { measure: category ? t('measure.category', { value: category }) : t('measure.noCategory') }),
    C('description', !!description,
      { measurable: detailPage, measure: !detailPage ? NEED_DETAIL : description ? t('measure.descChars', { count: description.length }) : t('measure.noDesc') }),
    C('openingDate', false, { unavailable: true, measure: t('measure.openingDate') }),
    C('address', !!address && !!street && !!(nb || city), { measure: address || t('measure.noAddress') }),
    C('hours', hours.length > 0,
      { measurable: detailPage, measure: !detailPage ? NEED_DETAIL : hours.length ? t('measure.hoursDays', { count: hours.length }) : t('measure.noHours') }),
    C('hoursAccuracy', false, { unavailable: true, measure: t('measure.hoursAccuracy') }),
    C('services', false, { unavailable: true, measure: t('measure.services') }),
    C('website', !!str(p.website), { measure: str(p.website) || t('measure.noWebsite') }),
    C('phone', !!str(p.phone), { measure: str(p.phone) || t('measure.noPhone') }),
  ];

  // Posts
  const posts = arr(p.ownerUpdates).map(rec).filter((u) => u !== null)
    .map((u) => ({ d: date(u.date) || date(u.postDate) || date(u.publishedAt), text: str(u.text) || '' }))
    .sort((a, b) => (b.d?.getTime() || 0) - (a.d?.getTime() || 0));
  const sincePost = posts[0]?.d ? days(posts[0].d, ref) : null;
  const postsG = [
    C('postFreq', sincePost !== null && sincePost <= 7,
      { measurable: detailPage, measure: !detailPage ? NEED_DETAIL : !posts.length ? t('measure.noPosts') : t('measure.posts', { count: posts.length, days: sincePost ?? '?' }) }),
    C('postKw', false, { unavailable: true, measure: t('measure.postKw') }),
  ];

  // Photos
  const imgCount = num(p.imagesCount);
  const photosG = [
    C('photoCount', (imgCount || 0) >= 10,
      { measurable: imgCount !== null, measure: imgCount !== null ? t('measure.photos', { count: imgCount }) : t('measure.noPhotoData') }),
    C('photoFreq', false, { unavailable: true, measure: t('measure.photoFreq') }),
    C('logo', false, { unavailable: true, measure: t('measure.logo') }),
  ];

  // Reviews — the crawl fetches only the newest one
  const newest = arr(p.reviews).map(rec).filter((r) => r !== null)
    .map((r) => ({ d: date(r.publishedAtDate), stars: num(r.stars) }))
    .filter((r) => r.d !== null)
    .sort((a, b) => b.d!.getTime() - a.d!.getTime())[0] ?? null;
  const sinceReview = newest ? days(newest.d!, ref) : null;
  const newestText = newest ? (sinceReview === 0 ? t('measure.newestToday') : t('measure.newestDays', { days: sinceReview ?? 0 })) : '';
  const reviewsG = [
    C('avg', (rating || 0) >= 4.4,
      { measurable: rating !== null, measure: rating !== null ? t('measure.avg', { rating: rating.toFixed(1) }) : t('measure.noScore') }),
    C('count', (reviewCount || 0) >= 100,
      { measurable: reviewCount !== null, measure: reviewCount !== null ? t('measure.reviews', { count: reviewCount }) : t('measure.noData') }),
    C('reviewFreq', sinceReview !== null && sinceReview <= REVIEW_FRESH_DAYS,
      { measurable: !!newest || reviewCount === 0,
        measure: newest ? (newest.stars ? t('measure.newestStars', { text: newestText, stars: newest.stars }) : newestText)
          : reviewCount === 0 ? t('measure.noReviews') : t('measure.noNewest') }),
    C('replyKw', false, { unavailable: true, measure: t('measure.replyNotCrawled') }),
    C('replyRate', false, { unavailable: true, measure: t('measure.replyNotCrawled') }),
  ];

  const groups = [basic, postsG, photosG, reviewsG].map((checks, i): Group => {
    const passed = checks.filter((c) => c.status === 'PASS').length;
    const measured = checks.filter((c) => c.status === 'PASS' || c.status === 'FAIL').length;
    const key = GROUP_KEYS[i];
    return { key, name: t(`groups.${key}`), checks, passed, measured, total: checks.length, grade: grade(passed, measured) };
  });
  const passed = groups.reduce((s, g) => s + g.passed, 0), measured = groups.reduce((s, g) => s + g.measured, 0);
  return { name, category, address, url: str(p.url), ref, scraped: date(p.scrapedAt), rating, reviewCount, dist, groups,
    passed, measured, overall: grade(passed, measured), coverage: { detailPage, images: images.length } };
}
