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
  icon: string;
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
// Criteria the public crawl can only approximate are reported as unmeasurable (see Review365_Analysis_1_Store.xlsx)
const GROUPS: { key: GroupKey; name: string; icon: string }[] = [
  { key: 'basic', name: 'Thông tin cơ bản', icon: '📄' },
  { key: 'posts', name: 'Bài đăng', icon: '📈' },
  { key: 'photos', name: 'Ảnh', icon: '🖼️' },
  { key: 'reviews', name: 'Đánh giá', icon: '⭐' },
];
export const GRADE_LABEL: Record<Grade, string> = { A: 'Xuất sắc', B: 'Tốt', C: 'Trung bình', D: 'Cần cải thiện', E: 'Kém' };

/** A store whose newest review is older than this is not getting reviews often enough. */
const REVIEW_FRESH_DAYS = 30;

// How each criterion is decided from the crawl — shown in the grading note.
export const RULES: Record<string, string> = {
  name: 'Không tính — Maps công khai không cho biết từ khóa mục tiêu để xác định tên có bị chèn từ khóa',
  category: 'Đạt nếu có danh mục chính (categoryName)',
  description: 'Đạt nếu có mô tả kinh doanh (description)',
  openingDate: 'Không tính — Maps công khai không có ngày khai trương',
  address: 'Đạt nếu có đủ số nhà/đường + phường hoặc tỉnh/thành',
  hours: 'Đạt nếu có giờ mở cửa (openingHours)',
  hoursAccuracy: 'Không tính — Maps công khai không có giờ hoạt động thực tế để đối chiếu',
  services: 'Không tính — Maps công khai không trả về danh mục dịch vụ khai báo trên GBP',
  website: 'Đạt nếu có website',
  phone: 'Đạt nếu có số điện thoại',
  postFreq: 'Đạt nếu bài đăng mới nhất của chủ quán cách ngày crawl ≤ 7 ngày',
  postKw: 'Không tính — Maps công khai không cho biết từ khóa mục tiêu của cửa hàng',
  photoCount: 'Đạt nếu tổng số ảnh trên hồ sơ (chủ quán + khách hàng) ≥ 10',
  photoFreq: 'Không tính — Maps công khai không phân biệt chắc chắn ảnh do chủ sở hữu đăng',
  logo: 'Không tính — Maps công khai không có dữ liệu logo riêng',
  avg: 'Đạt nếu điểm trung bình ≥ 4.4★',
  count: 'Đạt nếu số đánh giá ≥ 100',
  reviewFreq: `Đạt nếu đánh giá mới nhất cách ngày crawl ≤ ${REVIEW_FRESH_DAYS} ngày`,
  replyKw: 'Không tính — không crawl nội dung review (chi phí quá cao)',
  replyRate: 'Không tính — không crawl nội dung review (chi phí quá cao)',
};

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

interface CheckOpts { unavailable?: boolean; measurable?: boolean; measure?: string; fix?: string }

// ── Audit ───────────────────────────────────────────────────────────────────
export function audit(p: Place): Audit {
  const ref = date(p.scrapedAt) || new Date();
  const name = str(p.title) || '(không tên)';
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

  const C = (key: string, title: string, desc: string, ok: boolean, opts: CheckOpts = {}): Check => ({
    key, title, desc,
    status: opts.unavailable ? 'UNAVAILABLE' : opts.measurable === false ? 'UNKNOWN' : ok ? 'PASS' : 'FAIL',
    measure: opts.measure || '', fix: opts.fix || '',
  });
  const NEED_DETAIL = 'Cần crawl trang chi tiết (scrapePlaceDetailPage)';

  // Basic
  const street = str(p.street), address = str(p.address);

  const basic = [
    C('name', 'Tên doanh nghiệp', 'Tránh chèn từ khóa không liên quan vào tên doanh nghiệp', false,
      { unavailable: true, measure: 'Maps công khai không cho biết từ khóa mục tiêu để xác định tên có bị chèn từ khóa' }),
    C('category', 'Danh mục chính', 'Danh mục chính liên quan nhất cho các dịch vụ của bạn đã được thiết lập', !!category,
      { measure: category ? `Danh mục: ${category}` : 'Chưa có danh mục', fix: 'Thiết lập danh mục chính phù hợp nhất' }),
    C('description', 'Mô tả kinh doanh', 'Mô tả kinh doanh được thiết lập chính xác', !!description,
      { measurable: detailPage, measure: !detailPage ? NEED_DETAIL : description ? `${description.length} ký tự` : 'Chưa có mô tả', fix: 'Viết mô tả 250–750 ký tự có từ khóa dịch vụ & khu vực' }),
    C('openingDate', 'Ngày bắt đầu', 'Ngày mở cửa đã được cấu hình', false,
      { unavailable: true, measure: 'Google Maps công khai không trả về ngày khai trương' }),
    C('address', 'Địa chỉ', 'Tỉnh, địa chỉ đường, tên tòa nhà được đặt đúng', !!address && !!street && !!(nb || city),
      { measure: address || 'Chưa có địa chỉ', fix: 'Bổ sung đủ số nhà, tên đường, phường/quận, tỉnh' }),
    C('hours', 'Giờ kinh doanh được cấu hình', 'Giờ kinh doanh đã được cấu hình', hours.length > 0,
      { measurable: detailPage, measure: !detailPage ? NEED_DETAIL : hours.length ? `${hours.length}/7 ngày có giờ` : 'Chưa cài giờ', fix: 'Cài giờ mở cửa cho cả 7 ngày' }),
    C('hoursAccuracy', 'Độ chính xác giờ kinh doanh', 'Giờ kinh doanh khớp với giờ thực tế của cửa hàng', false,
      { unavailable: true, measure: 'Maps công khai không có giờ hoạt động thực tế để đối chiếu' }),
    C('services', 'Danh mục / dịch vụ', 'Danh mục dịch vụ được thiết lập', false,
      { unavailable: true, measure: 'Maps công khai không trả về danh mục dịch vụ khai báo trên GBP' }),
    C('website', 'Địa chỉ website', 'Đường dẫn trang web cửa hàng đã được cấu hình', !!str(p.website),
      { measure: str(p.website) || 'Chưa có website', fix: 'Gắn website (hoặc landing page) cho hồ sơ' }),
    C('phone', 'Số điện thoại', 'Số điện thoại cửa hàng đã được thiết lập', !!str(p.phone),
      { measure: str(p.phone) || 'Chưa có số điện thoại', fix: 'Thêm số điện thoại liên hệ' }),
  ];

  // Posts
  const posts = arr(p.ownerUpdates).map(rec).filter((u) => u !== null)
    .map((u) => ({ d: date(u.date) || date(u.postDate) || date(u.publishedAt), text: str(u.text) || '' }))
    .sort((a, b) => (b.d?.getTime() || 0) - (a.d?.getTime() || 0));
  const sincePost = posts[0]?.d ? days(posts[0].d, ref) : null;
  const postsG = [
    C('postFreq', 'Tần suất đăng bài', 'Có ít nhất một bài đăng mỗi tuần', sincePost !== null && sincePost <= 7,
      { measurable: detailPage, measure: !detailPage ? NEED_DETAIL : !posts.length ? 'Chưa có bài đăng nào' : `${posts.length} bài · bài mới nhất ${sincePost ?? '?'} ngày trước`, fix: 'Đăng ít nhất 1 bài / tuần (khuyến mãi, món mới, sự kiện)' }),
    C('postKw', 'Sử dụng từ khóa trong bài đăng mới nhất', 'Bài đăng mới nhất bao gồm các từ khóa mục tiêu', false,
      { unavailable: true, measure: 'Maps công khai không cho biết từ khóa mục tiêu của cửa hàng' }),
  ];

  // Photos
  const imgCount = num(p.imagesCount);
  const photosG = [
    C('photoCount', 'Số lượng ảnh', 'Hồ sơ có từ 10 ảnh trở lên (gồm cả ảnh khách hàng đăng)', (imgCount || 0) >= 10,
      { measurable: imgCount !== null, measure: imgCount !== null ? `${imgCount} ảnh trên hồ sơ` : 'Không có dữ liệu số ảnh', fix: 'Tải thêm ảnh không gian, sản phẩm, đội ngũ' }),
    C('photoFreq', 'Tần suất đăng ảnh', 'Ảnh gần nhất được cung cấp bởi chủ sở hữu trong tháng trước', false,
      { unavailable: true, measure: 'Maps công khai không phân biệt chắc chắn ảnh do chủ sở hữu đăng' }),
    C('logo', 'Hình ảnh logo và ảnh bìa', 'Logo và ảnh bìa đã được đặt', false,
      { unavailable: true, measure: 'Maps công khai không có dữ liệu logo riêng' }),
  ];

  // Reviews — the crawl fetches only the newest one
  const newest = arr(p.reviews).map(rec).filter((r) => r !== null)
    .map((r) => ({ d: date(r.publishedAtDate), stars: num(r.stars) }))
    .filter((r) => r.d !== null)
    .sort((a, b) => b.d!.getTime() - a.d!.getTime())[0] ?? null;
  const sinceReview = newest ? days(newest.d!, ref) : null;
  const reviewsG = [
    C('avg', 'Đánh giá trung bình', 'Đánh giá sao là 4.4 điểm trở lên', (rating || 0) >= 4.4,
      { measurable: rating !== null, measure: rating !== null ? `${rating.toFixed(1)} ★` : 'Không có điểm', fix: 'Mời khách hài lòng để lại đánh giá' }),
    C('count', 'Số lượng đánh giá', '100 đánh giá trở lên đã nhận được', (reviewCount || 0) >= 100,
      { measurable: reviewCount !== null, measure: reviewCount !== null ? `${reviewCount} đánh giá` : 'Không có dữ liệu', fix: 'Gắn QR / link đánh giá tại quầy, hóa đơn, tin nhắn' }),
    C('reviewFreq', 'Tần suất đánh giá', `Có đánh giá mới trong vòng ${REVIEW_FRESH_DAYS} ngày qua`, sinceReview !== null && sinceReview <= REVIEW_FRESH_DAYS,
      { measurable: !!newest || reviewCount === 0,
        measure: newest ? `Đánh giá mới nhất ${sinceReview === 0 ? 'hôm nay' : `${sinceReview} ngày trước`}${newest.stars ? ` · ${newest.stars}★` : ''}` : reviewCount === 0 ? 'Chưa có đánh giá nào' : 'Không có dữ liệu đánh giá mới nhất',
        fix: 'Chủ động mời khách để lại đánh giá sau mỗi lần sử dụng dịch vụ' }),
    C('replyKw', 'Đáp án đánh giá', 'Đánh giá trả lời bao gồm từ khóa nhãn hiệu (tên cửa hàng / khu vực)', false,
      { unavailable: true, measure: 'Không crawl nội dung review (chi phí quá cao) nên không có câu trả lời của chủ quán' }),
    C('replyRate', 'Tỷ lệ trả lời đánh giá', 'Tối thiểu 90% đánh giá được trả lời', false,
      { unavailable: true, measure: 'Không crawl nội dung review (chi phí quá cao) nên không có câu trả lời của chủ quán' }),
  ];

  const groups = [basic, postsG, photosG, reviewsG].map((checks, i): Group => {
    const passed = checks.filter((c) => c.status === 'PASS').length;
    const measured = checks.filter((c) => c.status === 'PASS' || c.status === 'FAIL').length;
    return { ...GROUPS[i], checks, passed, measured, total: checks.length, grade: grade(passed, measured) };
  });
  const passed = groups.reduce((s, g) => s + g.passed, 0), measured = groups.reduce((s, g) => s + g.measured, 0);
  return { name, category, address, url: str(p.url), ref, scraped: date(p.scrapedAt), rating, reviewCount, dist, groups,
    passed, measured, overall: grade(passed, measured), coverage: { detailPage, images: images.length } };
}
