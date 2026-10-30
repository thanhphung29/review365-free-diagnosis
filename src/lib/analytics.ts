import { sendGAEvent } from '@next/third-parties/google';

/** A Google Analytics event; skipped when GA is not on the page (no NEXT_PUBLIC_GA_ID). */
export function track(name: string, params: Record<string, string | number> = {}) {
  if (window.dataLayer) sendGAEvent('event', name, params);
}
