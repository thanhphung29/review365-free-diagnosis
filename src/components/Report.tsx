import type { ReactNode } from 'react';
import type { Audit, Check, CheckStatus } from '@/lib/audit';

const SIGNUP_URL = process.env.NEXT_PUBLIC_SIGNUP_URL || '#';

const fmtDate = (d: Date | null) =>
  d ? `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}` : '—';

const LOCK = <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
const ICON: Record<CheckStatus, ReactNode> = {
  PASS: <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="m8 12 3 3 5-6" /></svg>,
  FAIL: <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></svg>,
  UNKNOWN: LOCK,
  UNAVAILABLE: LOCK,
};
const isMeasured = (s: CheckStatus) => s === 'PASS' || s === 'FAIL';
const BADGE: Record<CheckStatus, ReactNode> = {
  PASS: <span className="chip ok">OK</span>,
  FAIL: <span className="chip bad">Cần cải thiện</span>,
  UNKNOWN: null,
  UNAVAILABLE: null,
};

export function Report({ a }: { a: Audit }) {
  return (
    <>
      <div className="card">
        <div className="small muted">📅 {fmtDate(a.scraped || a.ref)}</div>
        <div className="store">{a.name}</div>
        <div className="small muted">
          {[a.category, a.address].filter(Boolean).join(' · ')}
          {a.url ? <> · <a href={a.url} target="_blank" rel="noopener">Google Maps ↗</a></> : null}
        </div>
      </div>
      {a.groups.map((g) => {
        const item = (c: Check) => (
          <div className={isMeasured(c.status) ? 'item' : 'item locked'} key={c.key}>{ICON[c.status]}
            <div className="body"><div className="title">{c.title}</div><div className="desc">{c.desc}</div>{c.measure ? <div className="measure">{c.measure}</div> : null}</div>
            <div className="badges">{BADGE[c.status]}</div>
          </div>
        );
        // Measured checks first; the unmeasurable ones go last, behind the sign-up prompt.
        const locked = g.checks.filter((c) => !isMeasured(c.status));
        return (
          <div className="card" key={g.key}>
            <h2>{g.icon} {g.name}</h2>
            {g.checks.filter((c) => isMeasured(c.status)).map(item)}
            {locked.length ? (
              <div className="locked-zone">
                {locked.map(item)}
                <div className="unlock">
                  <p>Để xem đầy đủ báo cáo chẩn đoán, hãy đăng ký tài khoản Review365 ngay!</p>
                  <a className="cta" href={SIGNUP_URL} target="_blank" rel="noopener">Đăng ký ngay</a>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
