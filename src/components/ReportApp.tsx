'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react';
import Image from 'next/image';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import { RULES, audit, type Place } from '@/lib/audit';
import { parseMapsTarget } from '@/lib/maps-link';
import { Report } from './Report';

const POLL_MS = 4_000;
const POLL_LIMIT_MS = 10 * 60_000;
/** Consecutive network failures tolerated while polling before giving up. */
const POLL_RETRIES = 3;

const INVALID_LINK = 'Link chưa đúng — cần link Google Maps của một địa điểm (maps.app.goo.gl/…, google.com/maps/place/…)';
const FAILED = 'Không lấy được dữ liệu cửa hàng — vui lòng thử lại sau';
const CRITERIA = Object.keys(RULES).length;

/** Typed in turn into the empty search box; the first line is also the static placeholder. */
const PLACEHOLDERS = ['Dán link Google Maps của cửa hàng', 'https://maps.app.goo.gl/…', 'https://www.google.com/maps/place/…'];

const isPlace = (x: unknown): x is Place =>
  !!x && typeof x === 'object' && !Array.isArray(x) && !!((x as Place).title || (x as Place).placeId);

/**
 * fetch + JSON. Only input errors (bad link) are worded for the end user;
 * server/Apify problems are logged and shown as a generic failure.
 */
async function api<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(input, init);
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    if (res.status === 400 || res.status === 422) throw new Error(body?.error || INVALID_LINK);
    console.error('[crawl]', res.status, body?.error);
    throw new Error(FAILED);
  }
  if (!body) throw new Error(FAILED);
  return body;
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });

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
  const [place, setPlace] = useState<Place | null>(null);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The link behind the report on screen; searching it again would only repeat the crawl. */
  const [reportedLink, setReportedLink] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const placeholder = useTypewriter(PLACEHOLDERS, !link && !running);

  const report = useMemo(() => (place ? audit(place) : null), [place]);
  const idle = !running && !report;

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { document.title = report ? `Review365: Báo cáo kiểm tra sức khoẻ Google Maps của ${report.name}` : 'Báo cáo Google Business Profile'; }, [report]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const target = link.trim();
    if (running || target === reportedLink) return;
    if (!parseMapsTarget(link)) { setLinkError(INVALID_LINK); return; }
    setLinkError(null);
    setError(null);
    setRunning(true);

    const ctrl = new AbortController();
    abort.current = ctrl;
    const { signal } = ctrl;
    const startedAt = Date.now();

    try {
      const { runId } = await api<{ runId: string }>('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link }),
        signal,
      });

      let failures = 0;
      for (;;) {
        await wait(POLL_MS, signal);
        if (signal.aborted) return;
        if (Date.now() - startedAt > POLL_LIMIT_MS) throw new Error(FAILED);

        let run: { done: boolean; status: string; items?: unknown[] };
        try {
          run = await api(`/api/crawl/${runId}`, { signal });
          failures = 0;
        } catch (err) {
          // A dropped connection is retried; an error the server reports is not.
          if (signal.aborted) return;
          if (err instanceof TypeError && ++failures < POLL_RETRIES) continue;
          throw err;
        }
        if (!run.done) continue;
        if (run.status !== 'SUCCEEDED') throw new Error(FAILED);

        const found = (run.items ?? []).find(isPlace);
        if (!found) throw new Error('Không tìm thấy cửa hàng từ link này — kiểm tra lại link có trỏ đúng một địa điểm không');
        setPlace(found);
        setReportedLink(target);
        return;
      }
    } catch (err) {
      if (signal.aborted) return;
      setError(err instanceof TypeError ? 'Mất kết nối — kiểm tra mạng rồi thử lại' : (err as Error).message);
    } finally {
      if (abort.current === ctrl) abort.current = null;
      if (!signal.aborted) setRunning(false);
    }
  }

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
        <form className="crawl wrap" onSubmit={onSubmit} noValidate>
          {idle ? <p className="eyebrow"><span className="dot" aria-hidden="true" />Miễn phí · Có kết quả sau 1–2 phút</p> : null}
          <h1 className="logo">
            <span>Chẩn đoán hồ sơ</span>
            <Image src="/google-maps-logo.svg" alt="Google Maps" width={584} height={92} priority unoptimized />
          </h1>
          {idle ? <p className="pitch">Biết ngay hồ sơ Google Maps của cửa hàng đang mất khách ở đâu.</p> : null}
          <div className="search" aria-invalid={!!linkError}>
            <input
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => { setLink(e.target.value); setLinkError(null); }}
              placeholder={placeholder}
              aria-label="Link Google Maps của cửa hàng"
              aria-invalid={!!linkError}
              spellCheck={false}
              autoFocus
              disabled={running}
            />
            <button type="submit" className="go" disabled={running || !link.trim() || link.trim() === reportedLink}>
              {running ? <span className="spinner" aria-hidden="true" /> : <FontAwesomeIcon icon={faMagnifyingGlass} />}
              <span className="label">{running ? 'Đang phân tích…' : 'Chẩn đoán'}</span>
            </button>
          </div>
          {linkError ? <div className="field-error" role="alert">{linkError}</div> : null}
          {error ? <div className="status error" role="alert">{error}</div> : null}
          {idle ? (
            <>
              <ul className="perks">
                <li><FontAwesomeIcon icon={faCheck} />Không cần đăng nhập</li>
                <li><FontAwesomeIcon icon={faCheck} />Không cần cài đặt</li>
                <li><FontAwesomeIcon icon={faCheck} />{CRITERIA} tiêu chí của Review365</li>
              </ul>
              <details className="howto">
                <summary>Lấy link Google Maps ở đâu?</summary>
                <ol>
                  <li>Mở Google Maps và tìm cửa hàng của bạn.</li>
                  <li>Chọn <b>Sao chép đường liên kết</b> rồi dán vào ô phía trên.</li>
                </ol>
              </details>
            </>
          ) : null}
        </form>
      </header>

      {running || report ? (
        <main className="results">
          {running ? <Skeleton /> : report ? <Report a={report} /> : null}
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
