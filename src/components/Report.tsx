import type { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowRight, faArrowTrendUp, faArrowUp, faArrowUpRightFromSquare, faBuilding, faCheck, faChevronRight, faCircleExclamation,
  faCircleInfo, faClock, faImage, faInfo, faLocationDot, faLock, faNewspaper, faStar, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { Audit, Check, CheckStatus, GroupKey } from '@/lib/audit';

const SIGNUP_URL = process.env.NEXT_PUBLIC_SIGNUP_URL || 'https://review365.vn/#contact';

const pad = (n: number) => String(n).padStart(2, '0');
const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())} · ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

const GROUP_ICON: Record<GroupKey, IconDefinition> = { basic: faInfo, posts: faNewspaper, photos: faImage, reviews: faStar };

// Status icons, the same round ones as the score panel rows (.ov-row-ic).
const LOCK = <span className="status-ic locked"><FontAwesomeIcon icon={faLock} /></span>;
const ICON: Record<CheckStatus, ReactNode> = {
  PASS: <span className="status-ic pass"><FontAwesomeIcon icon={faCheck} /></span>,
  FAIL: <span className="status-ic fail"><FontAwesomeIcon icon={faXmark} /></span>,
  UNKNOWN: LOCK,
  UNAVAILABLE: LOCK,
};
const isMeasured = (s: CheckStatus) => s === 'PASS' || s === 'FAIL';

export function Report({ a }: { a: Audit }) {
  return (
    <>
      <ReportHeader a={a} />
      {/* The detail cards hang off a numbered line: each is the expansion of the matching overview group card. */}
      <div className="wrap details-tree" id="details">
        {a.groups.map((g) => {
          const item = (c: Check) => (
            <div className={isMeasured(c.status) ? 'item' : 'item locked'} key={c.key}>{ICON[c.status]}
              <div className="body"><div className="title">{c.title}</div><div className="desc">{c.desc}</div>{c.measure ? <div className="measure">{c.measure}</div> : null}</div>
            </div>
          );
          // Measured checks first; the locked ones go last.
          const locked = g.checks.filter((c) => !isMeasured(c.status));
          const gt = tally(g.checks);
          return (
            <section className={`tree-item tone-${toneOf(gt, g.checks.length)}`} id={`group-${g.key}`} key={g.key}>
              <header className="tree-head">
                <span className="tree-node"><FontAwesomeIcon icon={GROUP_ICON[g.key]} /></span>
                <div className="tree-title">
                  <h2>{g.name}</h2>
                </div>
                <div className="ov-group-count"><b>{gt.pass}</b>/{g.checks.length} <small>đạt</small></div>
              </header>
              <div className={`card group-${g.key}`}>
                {g.key === 'reviews' && a.dist ? <ReviewSummary a={a} dist={a.dist} /> : null}
                {/* "Thông tin cơ bản" has many checks, so its locked block spans the full width below; elsewhere it is one more grid cell. */}
                <div className="item-grid">
                  {g.checks.filter((c) => isMeasured(c.status)).map(item)}
                  {locked.length && g.key !== 'basic' ? <LockedZone checks={locked} /> : null}
                </div>
                {locked.length && g.key === 'basic' ? <LockedZone checks={locked} /> : null}
              </div>
            </section>
          );
        })}
      </div>
      <div className="wrap to-top">
        <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
          <span className="to-top-ic"><FontAwesomeIcon icon={faArrowUp} /></span>
          Scroll Top
        </a>
      </div>
    </>
  );
}

/** A group's locked checks in one clearly-locked block. */
function LockedZone({ checks }: { checks: Check[] }) {
  return (
    <div className="locked-zone">
      <div className="lz-head">
        {LOCK}
        <div className="lz-text">
          <b>{checks.length} tiêu chí đang bị khoá</b>
          <ul className="lz-titles">{checks.map((c) => <li key={c.key}>{c.title}</li>)}</ul>
        </div>
      </div>
    </div>
  );
}

type PartKey = 'pass' | 'fail' | 'locked';
const PARTS: { key: PartKey; label: string }[] = [
  { key: 'pass', label: 'Đạt' },
  { key: 'fail', label: 'Không đạt' },
  { key: 'locked', label: 'Bị khoá' },
];

/** Pass / fail / locked counts over a set of checks. */
function tally(checks: Check[]): Record<PartKey, number> {
  const pass = checks.filter((c) => c.status === 'PASS').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  return { pass, fail, locked: checks.length - pass - fail };
}

const PART_ICON: Record<PartKey, IconDefinition> = { pass: faCheck, fail: faXmark, locked: faLock };

const R = 80;
const C = 2 * Math.PI * R;
const STROKE = 6;
/** Visible gap between arcs; round caps reach STROKE / 2 past each end, so leave room for both. */
const GAP = 6 + STROKE;

/** Glowing part-to-whole ring on the dark score panel; the pass count sits in a glass disc in the middle. */
function Donut({ t, total }: { t: Record<PartKey, number>; total: number }) {
  const shown = PARTS.filter((p) => t[p.key] > 0);
  const lens = shown.map((p) => (t[p.key] / total) * C);
  const arcs = shown.map((p, i) => ({ ...p, len: lens[i], offset: lens.slice(0, i).reduce((x, y) => x + y, 0) }));
  return (
    <svg className="donut" viewBox="0 0 200 200" role="img" aria-label={PARTS.map((p) => `${p.label}: ${t[p.key]}`).join(', ')}>
      <defs>
        <linearGradient id="arc-pass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a7f3c4" /><stop offset="1" stopColor="#34d17a" /></linearGradient>
        <linearGradient id="arc-fail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#ef8a78" /><stop offset="1" stopColor="#d4604f" /></linearGradient>
        <radialGradient id="glass" cx=".4" cy=".3" r=".8"><stop offset="0" stopColor="#2a4d46" /><stop offset="1" stopColor="#1a3b36" /></radialGradient>
      </defs>
      <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255, 255, 255, .08)" strokeWidth={STROKE} />
      <g transform="rotate(-90 100 100)">
        {arcs.map((p) => (
          <circle key={p.key} className={`arc ${p.key}`} cx="100" cy="100" r={R} fill="none" strokeWidth={STROKE} strokeLinecap="round"
            strokeDasharray={`${Math.max(p.len - GAP, 1)} ${C}`} strokeDashoffset={-p.offset}>
            <title>{`${p.label}: ${t[p.key]} tiêu chí`}</title>
          </circle>
        ))}
      </g>
      <circle cx="100" cy="100" r="64" fill="url(#glass)" stroke="rgba(160, 150, 80, .3)" strokeWidth=".75" />
      <text x="100" y="104" textAnchor="middle" className="donut-num">{t.pass}<tspan className="donut-of" dx="2">/{total}</tspan></text>
      <text x="100" y="128" textAnchor="middle" className="donut-label">tiêu chí đạt</text>
    </svg>
  );
}

type Tone = 'done' | 'good' | 'warn' | 'bad';
const TONE: Record<Tone, { label: string; icon: IconDefinition }> = {
  done: { label: 'Hoàn thiện', icon: faCheck },
  good: { label: 'Đang cải thiện', icon: faCheck },
  warn: { label: 'Cần cải thiện', icon: faCircleExclamation },
  bad: { label: 'Cần ưu tiên', icon: faXmark },
};
/** How a group is doing: nothing failed reads as on track, all-failed as the priority. */
function toneOf(t: Record<PartKey, number>, total: number): Tone {
  if (t.pass === total) return 'done';
  if (!t.fail) return 'good';
  return t.pass ? 'warn' : 'bad';
}

const GROUP_BLURB: Record<GroupKey, string> = {
  basic: 'Đầy đủ và chính xác các thông tin cơ bản của doanh nghiệp.',
  posts: 'Tăng tương tác và cập nhật thông tin thường xuyên.',
  photos: 'Hình ảnh chất lượng, rõ nét, đa dạng và đúng quy định.',
  reviews: 'Tăng số lượng và cải thiện chất lượng đánh giá.',
};

/** Line-drawn skyline with a pin, closing the groups panel. */
function Skyline() {
  return (
    <svg className="ov-skyline" viewBox="0 0 360 70" aria-hidden="true">
      <g fill="none" stroke="#9fd6cf" strokeWidth="1.3">
        <path d="M0 68h340" />
        <path d="M20 68V50h18v18M44 68V36h22v32M50 42h10M50 50h10M50 58h10M72 68V24h20v44M78 30h8M78 38h8M78 46h8M78 54h8" />
        <path d="M100 68V44h16v24M122 68V14l12-8 12 8v54M128 22h12M128 32h12M128 42h12M128 52h12M152 68V40h24v28M158 46h12M158 54h12" />
        <path d="M182 68V30l8-10 8 10v38M204 68V48h28v20M210 54h16M238 68V34h18v34M244 40h6M244 48h6M244 56h6M262 68V52h22v16M290 68V42h16v26" />
      </g>
      <path d="M332 46c-3-6-9-10-9-17a9 9 0 1 1 18 0c0 7-6 11-9 17z" fill="#14a39a" /><circle cx="332" cy="29" r="3.2" fill="#fff" />
    </svg>
  );
}

/** Report overview: the store, the overall pass / fail / locked split on a dark score panel, and a card per group. */
function ReportHeader({ a }: { a: Audit }) {
  const all = a.groups.flatMap((g) => g.checks);
  const t = tally(all);
  const [first, ...rest] = a.name.trim().split(/\s+/);

  return (
    <section className="overview">
      <div className="wrap">
        <div className="ov-top">
          <div className="ov-store">
            <div className="ov-time"><FontAwesomeIcon icon={faClock} /> Báo cáo lúc <b>{fmtTime(a.scraped || a.ref)}</b></div>
            <h1 className="store">
              <span className="store-lead">Review365: Báo cáo kiểm tra sức khoẻ Google Maps của</span>
              <span className="store-id">
                <span className="store-name">{first}{rest.length ? <> <span className="store-name-accent">{rest.join(' ')}</span></> : null}</span>
              </span>
            </h1>
            <div className="store-facts">
              {a.rating !== null ? (
                <span className="rating"><FontAwesomeIcon icon={faStar} className="star" /><b>{a.rating.toFixed(1)}</b>{a.reviewCount !== null ? <span className="dim">({a.reviewCount.toLocaleString('vi-VN')} đánh giá)</span> : null}</span>
              ) : null}
              {a.category ? <span className="cat"><FontAwesomeIcon icon={faBuilding} />{a.category}</span> : null}
            </div>
            {a.address || a.url ? (
              <div className="addr-card">
                <FontAwesomeIcon icon={faLocationDot} className="addr-ic" />
                <div>
                  {a.address ? <div className="addr-text">{a.address}</div> : null}
                  {a.url ? <a href={a.url} target="_blank" rel="noopener">Xem trên Google Maps <FontAwesomeIcon icon={faArrowUpRightFromSquare} /></a> : null}
                </div>
              </div>
            ) : null}
            <p className="ov-lede">
              <FontAwesomeIcon icon={faCircleInfo} className="lede-ic" />
              Đánh giá mức độ hoàn thiện hồ sơ Google Maps của doanh nghiệp và gợi ý cải thiện để tăng khả năng hiển thị, thu hút khách hàng.
            </p>
            <div className="unlock ov-unlock">
              <span className="ov-unlock-ic"><FontAwesomeIcon icon={faLock} /></span>
              <p>Để xem đầy đủ báo cáo chẩn đoán, hãy đăng ký tài khoản Review365 ngay!</p>
              <a className="cta" href={SIGNUP_URL} target="_blank" rel="noopener">Đăng ký ngay</a>
            </div>
          </div>

          <div className="ov-score">
            <p className="ov-note" aria-hidden="true">
              Còn nhiều<br />tiềm năng!
              <svg viewBox="0 0 60 40"><path d="M50 4c4 16-6 30-36 30m0 0 8-7m-8 7 9 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </p>
            <Donut t={t} total={all.length} />
            <ul className="ov-rows">
              {PARTS.filter((p) => t[p.key] > 0).map((p) => {
                const pct = Math.round((t[p.key] / all.length) * 100);
                const locked = p.key === 'locked';
                return (
                  <li key={p.key}>
                    <a className={`ov-row ${p.key}`} href={locked ? SIGNUP_URL : '#details'} {...(locked ? { target: '_blank', rel: 'noopener' } : {})}>
                      <span className="ov-row-ic"><FontAwesomeIcon icon={PART_ICON[p.key]} /></span>
                      <span className="ov-row-text">
                        <b>{p.label}</b>
                        {locked ? <span className="unlock-hint">Đăng ký để mở khoá <FontAwesomeIcon icon={faArrowRight} /></span> : <span>{pct}% tiêu chí</span>}
                      </span>
                      <span className="ov-row-num">{t[p.key]}</span>
                      <FontAwesomeIcon icon={faChevronRight} className="ov-row-go" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="ov-groups">
          <div className="ov-groups-head">
            <div>
              <h2>Theo nhóm tiêu chí</h2>
              <p>Chi tiết tình trạng và tiến độ của từng nhóm tiêu chí</p>
            </div>
            <a className="ov-all" href="#details">Xem chi tiết tất cả tiêu chí <FontAwesomeIcon icon={faChevronRight} /></a>
          </div>
          <ul className="ov-group-grid">
            {a.groups.map((g) => {
              const gt = tally(g.checks);
              const tone = toneOf(gt, g.checks.length);
              return (
                <li key={g.key} className={`ov-group tone-${tone}`}>
                  <span className="ov-group-ic"><FontAwesomeIcon icon={GROUP_ICON[g.key]} /></span>
                  <div className="ov-group-body">
                    <div className="ov-group-row">
                      <h3>{g.name}</h3>
                      <div className="ov-group-count"><b>{gt.pass}</b>/{g.checks.length} <small>đạt</small></div>
                    </div>
                    <div className="ov-group-row">
                      <div className="ov-progress" role="img" aria-label={`${g.name}: ${gt.pass}/${g.checks.length} đạt`}>
                        <span style={{ width: `${(gt.pass / g.checks.length) * 100}%` }} />
                      </div>
                      <span className="ov-chip"><FontAwesomeIcon icon={TONE[tone].icon} />{TONE[tone].label}</span>
                    </div>
                    <p>{GROUP_BLURB[g.key]}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="ov-groups-foot">
            <p className="ov-hand">
              <svg viewBox="0 0 34 24" aria-hidden="true"><path d="M3 3c0 12 8 18 22 16m0 0-5-5m5 5-6 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Cải thiện từng tiêu chí – Nâng tầm thương hiệu
              <FontAwesomeIcon icon={faArrowTrendUp} />
            </p>
            <Skyline />
          </div>
        </div>
      </div>
    </section>
  );
}

const STARS = [0, 1, 2, 3, 4].map((i) => <FontAwesomeIcon key={i} icon={faStar} />);

function ReviewSummary({ a, dist }: { a: Audit; dist: number[] }) {
  const sum = dist.reduce((x, y) => x + y, 0);
  const total = a.reviewCount ?? sum;
  const pct = (n: number) => (sum ? Math.round((n / sum) * 100) : 0);
  const max = Math.max(...dist, 1);
  const positive = pct(dist[0] + dist[1]);
  const negative = pct(dist[3] + dist[4]);

  return (
    <div className="reviews-summary">
      <div className="rs-score">
        <div className="rs-avg">{a.rating !== null ? a.rating.toFixed(1) : '—'}</div>
        <div className="rs-stars" aria-label={a.rating !== null ? `${a.rating.toFixed(1)} trên 5 sao` : 'Chưa có điểm'}>
          <span className="rs-stars-fill" style={{ width: `${((a.rating ?? 0) / 5) * 100}%` }}>{STARS}</span>{STARS}
        </div>
        <div className="rs-total">{total.toLocaleString('vi-VN')} đánh giá</div>
      </div>

      <ul className="rs-dist" aria-label="Phân bố đánh giá theo số sao">
        {dist.map((n, i) => (
          <li key={i} data-tip={`${5 - i} sao: ${n.toLocaleString('vi-VN')} đánh giá (${pct(n)}%)`}>
            <span className="rs-star-label">{5 - i}<FontAwesomeIcon icon={faStar} /></span>
            <span className="rs-track"><span className="rs-bar" style={{ width: `${(n / max) * 100}%` }} /></span>
            <span className="rs-count">{n.toLocaleString('vi-VN')}</span>
            <span className="rs-pct">{pct(n)}%</span>
          </li>
        ))}
      </ul>

      <div className="rs-insights">
        <div><b>{positive}%</b><span>tích cực (4–5 sao)</span></div>
        <div><b>{pct(dist[2])}%</b><span>trung lập (3 sao)</span></div>
        <div><b>{negative}%</b><span>tiêu cực (1–2 sao)</span></div>
      </div>
    </div>
  );
}
