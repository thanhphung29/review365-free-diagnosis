'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faChevronDown, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';

/** Header language picker: a globe button with the current code, opening a short menu of the three languages. */
export function LocaleSwitcher() {
  const t = useTranslations('lang');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
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

  function choose(next: Locale) {
    setOpen(false);
    if (next === locale) return;
    startTransition(() => router.replace(pathname, { locale: next }));
  }

  return (
    <div className="lang-switch" ref={box}>
      <button type="button" className="lang-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={t('label')}
        disabled={pending} onClick={() => setOpen((v) => !v)}>
        <FontAwesomeIcon icon={faGlobe} />
        <span>{locale.toUpperCase()}</span>
        <FontAwesomeIcon icon={faChevronDown} className="lang-caret" />
      </button>
      {open ? (
        <ul className="lang-menu" role="listbox" aria-label={t('label')}>
          {routing.locales.map((l) => (
            <li key={l} role="option" aria-selected={l === locale}>
              <button type="button" lang={l} onClick={() => choose(l)}>
                <span className="lang-code">{l.toUpperCase()}</span>
                {t(l)}
                {l === locale ? <FontAwesomeIcon icon={faCheck} className="lang-tick" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
