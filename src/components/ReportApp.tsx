'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { audit, type Place } from '@/lib/audit';
import { parseMapsTarget } from '@/lib/maps-link';
import { Report } from './Report';

const POLL_MS = 4_000;
const POLL_LIMIT_MS = 10 * 60_000;
/** Consecutive network failures tolerated while polling before giving up. */
const POLL_RETRIES = 3;

const INVALID_LINK = 'Link chưa đúng — cần link Google Maps của một địa điểm (maps.app.goo.gl/…, google.com/maps/place/…)';
const FAILED = 'Không lấy được dữ liệu cửa hàng — vui lòng thử lại sau';

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

export function ReportApp() {
  const [place, setPlace] = useState<Place | null>(null);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const report = useMemo(() => (place ? audit(place) : null), [place]);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { document.title = report ? `Báo cáo GBP — ${report.name}` : 'Báo cáo Google Business Profile'; }, [report]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (running) return;
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
        requestAnimationFrame(() => reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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

  return (
    <div className="wrap">
      <form className="card crawl" onSubmit={onSubmit} noValidate>
        <div>
          <h2>🔎 Chấm điểm hồ sơ Google Maps</h2>
          <p className="small muted" style={{ margin: '4px 0 0' }}>Dán link Google Maps của cửa hàng để nhận báo cáo.</p>
        </div>
        <div className="field">
          <div className="control">
            <input
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => { setLink(e.target.value); setLinkError(null); }}
              placeholder="https://maps.app.goo.gl/… hoặc https://www.google.com/maps/place/…"
              aria-label="Link Google Maps của cửa hàng"
              aria-invalid={!!linkError}
              spellCheck={false}
              autoFocus
              disabled={running}
            />
            <button type="submit" className="primary" disabled={running || !link.trim()}>
              {running ? <><span className="spinner" aria-hidden="true" />Đang phân tích…</> : 'Chấm điểm'}
            </button>
          </div>
          {linkError ? <div className="field-error" role="alert">{linkError}</div> : null}
        </div>
        {error ? <div className="status error" role="alert">{error}</div> : null}
      </form>

      <div ref={reportRef} />
      {running ? <Skeleton /> : report ? <Report a={report} /> : (
        <div className="card empty">
          <div style={{ fontSize: 32 }}>📍</div>
          <p style={{ margin: '8px 0 0' }}>Dán link Google Maps của cửa hàng ở trên để xem báo cáo.</p>
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div aria-hidden="true">
      <div className="card">
        <div className="sk" style={{ width: 120, height: 14 }} />
        <div className="sk" style={{ width: '55%', height: 20, marginTop: 10 }} />
        <div className="sk" style={{ width: '75%', height: 12, marginTop: 8 }} />
      </div>
      {[0, 1].map((i) => (
        <div className="card" key={i}>
          <div className="sk" style={{ width: 180, height: 20 }} />
          {[0, 1, 2].map((j) => <div key={j} className="sk" style={{ height: 52, marginTop: 8 }} />)}
        </div>
      ))}
    </div>
  );
}
