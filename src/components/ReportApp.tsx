'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faStethoscope, faXmark } from '@fortawesome/free-solid-svg-icons';
import { audit, type Place, type Translate } from '@/lib/audit';
import { parseMapsTarget } from '@/lib/maps-link';
import { routing } from '@/i18n/routing';
import { LocaleSwitcher } from './LocaleSwitcher';
import { Report } from './Report';

const POLL_MS = 4_000;
const POLL_LIMIT_MS = 10 * 60_000;
/** Consecutive network failures tolerated while polling before giving up. */
const POLL_RETRIES = 3;

/** The last report with its runId, so reopening the same ?r= (reload, language switch) needs no fetch. */
const LAST_KEY = 'r365:last';
/** Apify run id, the same shape the API route accepts. */
const RUN_ID = /^[A-Za-z0-9]{8,32}$/;

/** The report's own address: this page with ?r=<runId>, which reopens the same crawl. */
const shareUrlFor = (runId: string) => {
  const url = new URL(location.href);
  url.searchParams.set('r', runId);
  return url.href;
};
/** Shows (or drops) ?r= in the address bar without a navigation. */
function setRunInUrl(runId: string | null) {
  const url = new URL(location.href);
  if (runId) url.searchParams.set('r', runId);
  else url.searchParams.delete('r');
  history.replaceState(history.state, '', url);
}

/** Errors thrown while crawling carry a message key (search.errors.*), worded in the user's language when shown. */
class CrawlError extends Error {}

const isPlace = (x: unknown): x is Place =>
  !!x && typeof x === 'object' && !Array.isArray(x) && !!((x as Place).title || (x as Place).placeId);

/**
 * fetch + JSON. Only input errors (bad link) get their own message;
 * server/Apify problems are logged and shown as a generic failure.
 */
async function api<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(input, init);
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    if (res.status === 400 || res.status === 422) throw new CrawlError('invalidLink');
    // Unknown run, or one Apify has already deleted: a shared link that has expired.
    if (res.status === 404) throw new CrawlError('expired');
    console.error('[crawl]', res.status, body?.error);
    throw new CrawlError('failed');
  }
  if (!body) throw new CrawlError('failed');
  return body;
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });

/**
 * Follows a run until it ends and returns the crawled place, or null if aborted.
 * `first` asks straight away (a shared link, usually long finished); a fresh run waits a poll first.
 */
async function followRun(runId: string, signal: AbortSignal, first = false): Promise<Place | null> {
  const startedAt = Date.now();
  let failures = 0;
  for (let i = 0; ; i++) {
    if (i > 0 || !first) await wait(POLL_MS, signal);
    if (signal.aborted) return null;
    if (Date.now() - startedAt > POLL_LIMIT_MS) throw new CrawlError('failed');

    let run: { done: boolean; status: string; items?: unknown[] };
    try {
      run = await api(`/api/crawl/${runId}`, { signal });
      failures = 0;
    } catch (err) {
      // A dropped connection is retried; an error the server reports is not.
      if (signal.aborted) return null;
      if (err instanceof TypeError && ++failures < POLL_RETRIES) continue;
      throw err;
    }
    if (!run.done) continue;
    if (run.status !== 'SUCCEEDED') throw new CrawlError('failed');

    const found = (run.items ?? []).find(isPlace);
    if (!found) throw new CrawlError('notFound');
    return found;
  }
}

/** Types and erases each line in turn, while `on`; reduced-motion users get the first line, still. */
function useTypewriter(lines: readonly string[], on: boolean): string {
  const [text, setText] = useState(lines[0]);
  useEffect(() => {
    if (!on || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let line = 0;
    let len = lines[0].length;
    let erasing = true;
    let timer: number;
    const tick = () => {
      if (erasing && --len === 0) { erasing = false; line = (line + 1) % lines.length; }
      else if (!erasing) len++;
      setText(lines[line].slice(0, len));
      let delay = erasing ? 28 : 55;
      if (!erasing && len === lines[line].length) { erasing = true; delay = 2400; }
      timer = window.setTimeout(tick, delay);
    };
    timer = window.setTimeout(tick, 2400);
    return () => clearTimeout(timer);
  }, [lines, on]);
  return on ? text : lines[0];
}

export function ReportApp() {
  const t = useTranslations();
  const locale = useLocale();
  const [place, setPlace] = useState<Place | null>(null);
  const [link, setLink] = useState('');
  /** Message keys under search.errors, rendered in the current language. */
  const [linkError, setLinkError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The link behind the report on screen; searching it again would only repeat the crawl. */
  const [reportedLink, setReportedLink] = useState<string | null>(null);
  /** Address that reopens the report on screen (?r=<runId>); null until a run has finished. */
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // A stable array, so the typewriter only restarts when the language changes.
  const placeholders = useMemo(() => t.raw('search.placeholders') as string[], [t]);
  const placeholder = useTypewriter(placeholders, !link && !running);

  const report = useMemo(() => (place ? audit(place, t as unknown as Translate) : null), [place, t]);
  const idle = !running && !report;

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { document.title = report ? t('meta.reportTitle', { name: report.name }) : t('meta.title'); }, [report, t]);

  // The report on screen is the one named by ?r=<runId>; without it the page starts empty.
  // The copy kept in this tab saves a fetch when ?r= is the report just shown (reload, language switch).
  useEffect(() => {
    const r = new URLSearchParams(location.search).get('r');
    const shared = r && RUN_ID.test(r) ? r : null;
    if (!shared) return;

    let saved: { link: string; place: Place; runId?: string } | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(LAST_KEY) || 'null'); } catch { /* storage unavailable */ }
    if (saved?.place && saved.runId === shared) {
      const { link: savedLink, place: savedPlace } = saved;
      queueMicrotask(() => {
        setLink(savedLink); setReportedLink(savedLink); setPlace(savedPlace);
        setShareUrl(shareUrlFor(shared));
      });
      return;
    }

    // Someone else's report: one read of the finished run, no new crawl.
    const ctrl = new AbortController();
    abort.current = ctrl;
    queueMicrotask(() => setRunning(true));
    followRun(shared, ctrl.signal, true)
      .then((found) => {
        if (!found) return;
        setPlace(found);
        setShareUrl(shareUrlFor(shared));
        try { sessionStorage.setItem(LAST_KEY, JSON.stringify({ link: '', place: found, runId: shared })); } catch { /* storage full or blocked */ }
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setRunInUrl(null);
        setError(err instanceof TypeError ? 'offline' : err instanceof CrawlError ? err.message : 'failed');
      })
      .finally(() => {
        if (abort.current === ctrl) abort.current = null;
        if (!ctrl.signal.aborted) setRunning(false);
      });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const target = link.trim();
    if (running || target === reportedLink) return;
    if (!parseMapsTarget(link)) { setLinkError('invalidLink'); return; }
    setLinkError(null);
    setError(null);
    setRunning(true);
    setShareUrl(null);
    setRunInUrl(null);

    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const { signal } = ctrl;

    try {
      const { runId } = await api<{ runId: string }>('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link }),
        signal,
      });

      const found = await followRun(runId, signal);
      if (!found) return;
      setPlace(found);
      setReportedLink(target);
      setShareUrl(shareUrlFor(runId));
      setRunInUrl(runId);
      try { sessionStorage.setItem(LAST_KEY, JSON.stringify({ link: target, place: found, runId })); } catch { /* storage full or blocked */ }
    } catch (err) {
      if (signal.aborted) return;
      setError(err instanceof TypeError ? 'offline' : err instanceof CrawlError ? err.message : 'failed');
    } finally {
      if (abort.current === ctrl) abort.current = null;
      if (!signal.aborted) setRunning(false);
    }
  }

  /** An error message; <u> marks a sample link, kept whole so it never breaks across lines. */
  const errorText = (key: string) => t.rich(`search.errors.${key}`, { u: (chunks) => <span className="nowrap">{chunks}</span> });

  /** Moves the backdrop's spotlight (--x/--y on the hero) under the mouse. */
  function spotlight(e: PointerEvent<HTMLElement>) {
    if (e.pointerType !== 'mouse') return;
    const box = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--x', `${e.clientX - box.left}px`);
    e.currentTarget.style.setProperty('--y', `${e.clientY - box.top}px`);
  }

  return (
    // Idle, the search form sits mid-screen; once a search starts it glides up into a
    // sticky header bar, with the results below on their own tinted surface.
    <div className={idle ? 'app idle' : 'app'}>
      <header className="hero" onPointerMove={idle ? spotlight : undefined}>
        <div className="backdrop" aria-hidden="true"><div className="dots" /><div className="dots lit" /></div>
        {/* A full page load, so the logo always lands on an empty search page. */}
        <a className="brand" href={locale === routing.defaultLocale ? '/' : `/${locale}`}>
          <Image src="/review-365-logo-blue.png" alt="Review365" width={600} height={126} priority />
        </a>
        <LocaleSwitcher />
        <form className="crawl wrap" onSubmit={onSubmit} noValidate>
          {idle ? <p className="eyebrow"><span className="dot" aria-hidden="true" />{t('search.eyebrow')}</p> : null}
          <h1 className="logo">
            <span>{t('search.heading')}</span>
            <Image src="/google-maps-logo.svg" alt="Google Maps" width={584} height={92} priority unoptimized />
          </h1>
          {idle ? <p className="pitch">{t('search.pitch')}</p> : null}
          <div className="search" aria-invalid={!!linkError}>
            <input
              ref={input}
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => { setLink(e.target.value); setLinkError(null); }}
              placeholder={placeholder}
              aria-label={t('search.inputLabel')}
              aria-invalid={!!linkError}
              spellCheck={false}
              autoFocus
              disabled={running}
            />
            {link && !running ? (
              <button
                type="button"
                className="clear"
                onClick={() => { setLink(''); setLinkError(null); input.current?.focus(); }}
                aria-label={t('search.clear')}
                title={t('search.clear')}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            ) : null}
            <button type="submit" className="go" disabled={running || !link.trim() || link.trim() === reportedLink}>
              {running ? <span className="spinner" aria-hidden="true" /> : <FontAwesomeIcon icon={faStethoscope} />}
              <span className="label">{running ? t('search.running') : t('search.submit')}</span>
            </button>
          </div>
          {linkError ? <div className="field-error" role="alert">{errorText(linkError)}</div> : null}
          {error ? <div className="status error" role="alert">{errorText(error)}</div> : null}
          {idle ? (
            <>
              <ul className="perks">
                <li><FontAwesomeIcon icon={faCheck} />{t('search.perkNoLogin')}</li>
                <li><FontAwesomeIcon icon={faCheck} />{t('search.perkNoInstall')}</li>
                <li><FontAwesomeIcon icon={faCheck} />{t('search.perkCriteria')}</li>
              </ul>
              <details className="howto">
                <summary>{t('search.howtoSummary')}</summary>
                <ol>
                  <li>{t('search.howtoStep1')}</li>
                  <li>{t.rich('search.howtoStep2', { b: (chunks) => <b>{chunks}</b> })}</li>
                </ol>
              </details>
            </>
          ) : null}
        </form>
        {/* Apify reports no real progress: the bar is paced by CSS and stops short of the end until the result is in. */}
        {running ? <div className="progress" role="progressbar" aria-label={t('search.running')} /> : null}
      </header>

      {running || report ? (
        <main className="results">
          {running ? <Skeleton /> : report ? <Report a={report} shareUrl={shareUrl} /> : null}
        </main>
      ) : null}
    </div>
  );
}

/** Loading state laid out like the report overview, so the page does not jump when results arrive. */
function Skeleton() {
  const bar = (width: number | string, height: number, marginTop = 0, extra = '') => (
    <div className={`sk ${extra}`} style={{ width, height, marginTop }} />
  );
  return (
    <div aria-hidden="true">
      <section className="overview">
        <div className="wrap">
          <div className="ov-top">
            <div className="ov-store">
              {bar(200, 14)}
              {bar('62%', 16, 20)}
              {bar('42%', 34, 10)}
              {bar('48%', 16, 12)}
              {bar('85%', 14, 20)}
              {bar('30%', 14, 8)}
              {bar('90%', 12, 20)}
              {bar('65%', 12, 8)}
              {bar('100%', 72, 20, 'sk-block')}
            </div>
            <div className="ov-score">
              <div className="sk-ring" />
              <div className="ov-rows">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="ov-row sk-row">
                    <div className="sk on-dark" style={{ width: 32, height: 32, borderRadius: 999 }} />
                    <div>
                      <div className="sk on-dark" style={{ width: '45%', height: 14 }} />
                      <div className="sk on-dark" style={{ width: '30%', height: 10, marginTop: 6 }} />
                    </div>
                    <div className="sk on-dark" style={{ width: 20, height: 20 }} />
                    <span />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="ov-groups">
            <div className="ov-groups-head">
              <div style={{ flex: 1 }}>{bar(240, 24)}{bar(320, 14, 8)}</div>
              {bar(210, 38, 0, 'sk-pill')}
            </div>
            <ul className="ov-group-grid">
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="ov-group sk-group">
                  <div className="sk ov-group-ic" />
                  <div className="ov-group-body">
                    <div className="ov-group-row">{bar('35%', 16)}{bar(56, 16)}</div>
                    <div className="ov-group-row"><div className="sk" style={{ flex: 1, height: 6 }} />{bar(90, 18)}</div>
                    {bar('70%', 12)}
                  </div>
                </li>
              ))}
            </ul>
            <div className="ov-groups-foot">{bar(320, 18)}</div>
          </div>
        </div>
      </section>
      <div className="wrap details-tree">
        {/* one placeholder per real group, laid out the same way (group-* classes give the same columns) */}
        {[
          { key: 'basic', n: 6 },
          { key: 'posts', n: 1 },
          { key: 'photos', n: 1 },
          { key: 'reviews', n: 3, summary: true },
        ].map(({ key, n, summary }) => (
          <div className="tree-item" key={key}>
            <div className="tree-head">
              <div className="sk tree-node" />
              <div className="tree-title">{bar(180, 20)}</div>
              {bar(56, 16)}
            </div>
            <div className={`card group-${key}`}>
              {summary ? <div className="sk sk-block" style={{ height: 180, marginBottom: 8 }} /> : null}
              <div className="item-grid">
                {Array.from({ length: n }, (_, j) => (
                  <div key={j} className="item sk-item">
                    <div className="sk" style={{ width: 28, height: 28, borderRadius: 999, flex: 'none' }} />
                    <div style={{ flex: 1 }}>
                      {bar('55%', 16)}
                      {bar('85%', 10, 8)}
                      {bar('40%', 10, 6)}
                    </div>
                  </div>
                ))}
              </div>
              {bar('100%', 72, 12, 'sk-block')}
            </div>
          </div>
        ))}
      </div>
      <div className="wrap to-top sk-to-top">
        <div className="sk" style={{ width: 44, height: 44, borderRadius: 999, margin: '0 auto' }} />
        <div className="sk" style={{ width: 80, height: 14, margin: '8px auto 0' }} />
      </div>
    </div>
  );
}
