import { useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faFacebook, faLinkedin, faXTwitter } from '@fortawesome/free-brands-svg-icons';
import {
  faArrowRight, faArrowTrendUp, faArrowUp, faArrowUpRightFromSquare, faBuilding, faCheck, faChevronRight, faCircleExclamation,
  faCircleInfo, faClock, faFilePdf, faImage, faInfo, faLink, faLocationDot, faLock, faNewspaper, faShareNodes, faStar, faXmark,
} from '@fortawesome/free-solid-svg-icons';
import type { Audit, Check, CheckStatus, GroupKey } from '@/lib/audit';
import type { Locale } from '@/i18n/routing';
import { track } from '@/lib/analytics';

// Sign-up page in the visitor's language, linked from the locked checks' CTA.
const SIGNUP_URL: Record<Locale, string> = {
  vi: 'https://meo-tools.com/users/sign_up?agency=1i16qi24&locale=vi',
  en: 'https://meo-tools.com/users/sign_up?agency=1i16qi24&locale=en',
  ja: 'https://meo-tools.com/users/sign_up?agency=1i16qi24&locale=ja',
};
const useSignupUrl = () => SIGNUP_URL[useLocale() as Locale];

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

export function Report({ a, shareUrl }: { a: Audit; shareUrl: string | null }) {
  const t = useTranslations('overview');
  return (
    <>
      {/* Printed / PDF copies only: the brand on top of the first page. */}
      <div className="wrap print-only print-brand">
        <Image src="/review-365-logo-blue.png" alt="Review365" width={600} height={126} loading="eager" />
      </div>
      <ReportHeader a={a} shareUrl={shareUrl} />
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
                <div className="ov-group-count"><b>{gt.pass}</b>/{g.checks.length} <small>{t('passed')}</small></div>
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
          {t('scrollTop')}
        </a>
      </div>
      <ReportActions shareUrl={shareUrl} floating />
      {/* Printed / PDF copies only: where to open the live report again. */}
      {shareUrl ? <p className="wrap print-only print-link">{t('printLink')} <a href={shareUrl}>{shareUrl}</a></p> : null}
    </>
  );
}

/** A group's locked checks in one clearly-locked block. */
function LockedZone({ checks }: { checks: Check[] }) {
  const t = useTranslations('overview');
  return (
    <div className="locked-zone">
      <div className="lz-head">
        {LOCK}
        <div className="lz-text">
          <b>{t('locked', { count: checks.length })}</b>
          <ul className="lz-titles">{checks.map((c) => <li key={c.key}>{c.title}</li>)}</ul>
        </div>
        <a className="cta" href={useSignupUrl()} target="_blank" rel="noopener">{t('lockedCta')}</a>
      </div>
    </div>
  );
}

type PartKey = 'pass' | 'fail' | 'locked';
const PARTS: PartKey[] = ['pass', 'fail', 'locked'];

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
function Donut({ counts, total }: { counts: Record<PartKey, number>; total: number }) {
  const t = useTranslations('overview');
  const shown = PARTS.filter((key) => counts[key] > 0);
  const lens = shown.map((key) => (counts[key] / total) * C);
  const arcs = shown.map((key, i) => ({ key, label: t(`parts.${key}`), len: lens[i], offset: lens.slice(0, i).reduce((x, y) => x + y, 0) }));
  return (
    <svg className="donut" viewBox="0 0 200 200" role="img" aria-label={PARTS.map((key) => `${t(`parts.${key}`)}: ${counts[key]}`).join(', ')}>
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
            <title>{t('partTitle', { label: p.label, count: counts[p.key] })}</title>
          </circle>
        ))}
      </g>
      <circle cx="100" cy="100" r="64" fill="url(#glass)" stroke="rgba(160, 150, 80, .3)" strokeWidth=".75" />
      <text x="100" y="104" textAnchor="middle" className="donut-num">{counts.pass}<tspan className="donut-of" dx="2">/{total}</tspan></text>
      <text x="100" y="128" textAnchor="middle" className="donut-label">{t('scoreLabel')}</text>
    </svg>
  );
}

type Tone = 'done' | 'good' | 'warn' | 'bad';
const TONE_ICON: Record<Tone, IconDefinition> = { done: faCheck, good: faCheck, warn: faCircleExclamation, bad: faXmark };
/** How a group is doing: nothing failed reads as on track, all-failed as the priority. */
function toneOf(counts: Record<PartKey, number>, total: number): Tone {
  if (counts.pass === total) return 'done';
  if (!counts.fail) return 'good';
  return counts.pass ? 'warn' : 'bad';
}

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
/** Share the report's link where people talk, copy it, or print it to PDF; beside the report time. */
const SOCIAL = [
  { key: 'facebook', name: 'Facebook', icon: faFacebook, href: (u: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { key: 'x', name: 'X', icon: faXTwitter, href: (u: string, text: string) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(u)}&text=${encodeURIComponent(text)}` },
  { key: 'linkedin', name: 'LinkedIn', icon: faLinkedin, href: (u: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}` },
];
// Phones skip the menu for the system share sheet: the Facebook / LinkedIn apps catch the web share links
// and open on their home feed, dropping the link, while the sheet hands it to any app properly.
const isPhone = () => matchMedia('(pointer: coarse)').matches && typeof navigator.share === 'function';

/** Share and PDF buttons: labelled pills in the report header, or `floating` icon buttons pinned bottom-right. */
function ReportActions({ shareUrl, floating = false }: { shareUrl: string | null; floating?: boolean }) {
  const t = useTranslations('overview');
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close on a click outside or on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const placement = floating ? 'floating' : 'header';
  /** GA's recommended share event; method is where the link went. */
  const trackShare = (method: string) => track('share', { method, content_type: 'report', placement });

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      trackShare('copy_link');
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 1200);
    } catch { /* clipboard blocked */ }
  }

  return (
    <div className={floating ? 'fab-actions' : 'ov-actions'}>
      {shareUrl ? (
        <div className="share" ref={box}>
          <button type="button" className="ov-action" aria-haspopup="menu" aria-expanded={open}
            aria-label={floating ? t('share') : undefined} title={floating ? t('share') : undefined}
            onClick={() => {
              if (!isPhone()) { setOpen((v) => !v); return; }
              // Counted only once the sheet reports a share, not when it is dismissed.
              navigator.share({ title: document.title, url: shareUrl }).then(() => trackShare('native'), () => { /* dismissed */ });
            }}>
            <FontAwesomeIcon icon={faShareNodes} />{floating ? null : t('share')}
          </button>
          {open ? (
            <ul className="share-menu" role="menu">
              {SOCIAL.map((s) => (
                <li key={s.key} role="none">
                  <a role="menuitem" className={`share-${s.key}`} href={s.href(shareUrl, document.title)} target="_blank" rel="noopener" onClick={() => { trackShare(s.key); setOpen(false); }}>
                    <FontAwesomeIcon icon={s.icon} fixedWidth />{s.name}
                  </a>
                </li>
              ))}
              <li role="none">
                <button type="button" role="menuitem" onClick={copy}>
                  <FontAwesomeIcon icon={copied ? faCheck : faLink} fixedWidth />{copied ? t('copied') : t('copyLink')}
                </button>
              </li>
            </ul>
          ) : null}
        </div>
      ) : null}
      <button type="button" className="ov-action" onClick={() => { track('download_pdf', { placement }); window.print(); }}
        aria-label={floating ? t('pdf') : undefined} title={floating ? t('pdf') : undefined}>
        <FontAwesomeIcon icon={faFilePdf} />{floating ? null : t('pdf')}
      </button>
    </div>
  );
}

function ReportHeader({ a, shareUrl }: { a: Audit; shareUrl: string | null }) {
  const t = useTranslations('overview');
  const signupUrl = useSignupUrl();
  const format = useFormatter();
  const all = a.groups.flatMap((g) => g.checks);
  const counts = tally(all);
  const [first, ...rest] = a.name.trim().split(/\s+/);

  return (
    <section className="overview">
      <div className="wrap">
        <div className="ov-top">
          <div className="ov-store">
            <div className="ov-meta">
              <div className="ov-time"><FontAwesomeIcon icon={faClock} /> {t('reportedAt')} <b>{fmtTime(a.scraped || a.ref)}</b></div>
              <ReportActions shareUrl={shareUrl} />
            </div>
            <h1 className="store">
              <span className="store-lead">{t('lead')}</span>
              <span className="store-id">
                <span className="store-name">{first}{rest.length ? <> <span className="store-name-accent">{rest.join(' ')}</span></> : null}</span>
              </span>
            </h1>
            <div className="store-facts">
              {a.rating !== null ? (
                <span className="rating"><FontAwesomeIcon icon={faStar} className="star" /><b>{a.rating.toFixed(1)}</b>{a.reviewCount !== null ? <span className="dim">{t('reviewCount', { count: format.number(a.reviewCount) })}</span> : null}</span>
              ) : null}
              {a.category ? <span className="cat"><FontAwesomeIcon icon={faBuilding} />{a.category}</span> : null}
            </div>
            {a.address || a.url ? (
              <div className="addr-card">
                <FontAwesomeIcon icon={faLocationDot} className="addr-ic" />
                <div>
                  {a.address ? <div className="addr-text">{a.address}</div> : null}
                  {a.url ? <a href={a.url} target="_blank" rel="noopener">{t('viewOnMaps')} <FontAwesomeIcon icon={faArrowUpRightFromSquare} /></a> : null}
                </div>
              </div>
            ) : null}
            <p className="ov-lede">
              <FontAwesomeIcon icon={faCircleInfo} className="lede-ic" />
              {t('lede')}
            </p>
            <div className="unlock ov-unlock">
              <span className="ov-unlock-ic"><FontAwesomeIcon icon={faLock} /></span>
              <p>{t('unlockText')}</p>
              <a className="cta" href={signupUrl} target="_blank" rel="noopener">{t('unlockCta')}</a>
            </div>
          </div>

          <div className="ov-score">
            <Donut counts={counts} total={all.length} />
            <ul className="ov-rows">
              {PARTS.filter((key) => counts[key] > 0).map((key) => {
                const pct = Math.round((counts[key] / all.length) * 100);
                const locked = key === 'locked';
                return (
                  <li key={key}>
                    <a className={`ov-row ${key}`} href={locked ? signupUrl : '#details'} {...(locked ? { target: '_blank', rel: 'noopener' } : {})}>
                      <span className="ov-row-ic"><FontAwesomeIcon icon={PART_ICON[key]} /></span>
                      <span className="ov-row-text">
                        <b>{t(`parts.${key}`)}</b>
                        {locked ? <span className="unlock-hint">{t('unlockHint')} <FontAwesomeIcon icon={faArrowRight} /></span> : <span>{t('partShare', { pct })}</span>}
                      </span>
                      <span className="ov-row-num">{counts[key]}</span>
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
              <h2>{t('groupsTitle')}</h2>
              <p>{t('groupsSub')}</p>
            </div>
            <a className="ov-all" href="#details">{t('viewAll')} <FontAwesomeIcon icon={faChevronRight} /></a>
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
                      <div className="ov-group-count"><b>{gt.pass}</b>/{g.checks.length} <small>{t('passed')}</small></div>
                    </div>
                    <div className="ov-group-row">
                      <div className="ov-progress" role="img" aria-label={`${g.name}: ${gt.pass}/${g.checks.length} ${t('passed')}`}>
                        <span style={{ width: `${(gt.pass / g.checks.length) * 100}%` }} />
                      </div>
                      <span className="ov-chip"><FontAwesomeIcon icon={TONE_ICON[tone]} />{t(`tones.${tone}`)}</span>
                    </div>
                    <p>{t(`blurbs.${g.key}`)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="ov-groups-foot">
            <p className="ov-hand">
              <svg viewBox="0 0 34 24" aria-hidden="true"><path d="M3 3c0 12 8 18 22 16m0 0-5-5m5 5-6 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {t('footer')}
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
  const t = useTranslations('review');
  const format = useFormatter();
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
        <div className="rs-stars" aria-label={a.rating !== null ? t('outOf5', { rating: a.rating.toFixed(1) }) : t('noScore')}>
          <span className="rs-stars-fill" style={{ width: `${((a.rating ?? 0) / 5) * 100}%` }}>{STARS}</span>{STARS}
        </div>
        <div className="rs-total">{t('total', { count: total })}</div>
      </div>

      <ul className="rs-dist" aria-label={t('distLabel')}>
        {dist.map((n, i) => (
          <li key={i} data-tip={t('tip', { stars: 5 - i, count: format.number(n), pct: pct(n) })}>
            <span className="rs-star-label">{5 - i}<FontAwesomeIcon icon={faStar} /></span>
            <span className="rs-track"><span className="rs-bar" style={{ width: `${(n / max) * 100}%` }} /></span>
            <span className="rs-count">{format.number(n)}</span>
            <span className="rs-pct">{pct(n)}%</span>
          </li>
        ))}
      </ul>

      <div className="rs-insights">
        <div><b>{positive}%</b><span>{t('positive.label')} <span>{t('positive.stars')}</span></span></div>
        <div><b>{pct(dist[2])}%</b><span>{t('neutral.label')} <span>{t('neutral.stars')}</span></span></div>
        <div><b>{negative}%</b><span>{t('negative.label')} <span>{t('negative.stars')}</span></span></div>
      </div>
    </div>
  );
}
