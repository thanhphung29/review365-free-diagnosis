// Turn whatever the user pasted (a Google Maps link, a short link or a bare
// place id) into something the Apify Google Maps actor accepts.

export type MapsTarget =
  | { kind: 'placeId'; placeId: string }
  | { kind: 'url'; url: string }
  /** A short link: must be expanded (redirect hops) before it is usable. */
  | { kind: 'short'; url: string };

export const PLACE_ID = /^(ChIJ|GhIJ)[A-Za-z0-9_-]{23}$/;
// share.google is what newer Google / Maps app builds hand out from the Share sheet.
const SHORT_LINK_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co', 'share.google']);
const GOOGLE_HOST = /^(www\.|maps\.)?google\.[a-z.]{2,6}$/;

/**
 * Recognise one input as a target, or null.
 *
 * A link that carries a place id (`query_place_id=…`, `q=place_id:…`) is turned
 * into that id: the actor takes ids directly.
 */
export function parseMapsTarget(raw: string): MapsTarget | null {
  // The Maps app's "Copy" puts the place name (and sometimes the address) before the link:
  // keep just the first URL in the pasted text.
  const found = /https?:\/\/[^\s<>"']+/i.exec(raw)?.[0];
  const value = (found ?? raw).trim().replace(/^['"]+|['"]+$/g, '').replace(/[),.;!?]+$/, '');
  if (!value) return null;
  if (PLACE_ID.test(value)) return { kind: 'placeId', placeId: value };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase();
  if (SHORT_LINK_HOSTS.has(host)) {
    // goo.gl itself serves more than Maps; only its /maps/ links qualify.
    if (host === 'goo.gl' && !url.pathname.startsWith('/maps/')) return null;
    if (host === 'g.co' && !url.pathname.startsWith('/kgs/')) return null;
    return { kind: 'short', url: url.toString() };
  }
  if (!GOOGLE_HOST.test(host)) return null;

  const embedded =
    url.searchParams.get('query_place_id') ??
    url.searchParams.get('place_id') ??
    /^place_id:(.+)$/.exec(url.searchParams.get('q') ?? '')?.[1] ??
    null;
  if (embedded && PLACE_ID.test(embedded)) return { kind: 'placeId', placeId: embedded };

  // The URL shapes the actor accepts (its own input validation).
  const path = url.pathname;
  if (path.includes('/maps/place') || path.includes('/maps/search') || url.searchParams.has('cid')) {
    return { kind: 'url', url: url.toString() };
  }
  // `ftid=0x<feature>:0x<cid>` (iPhone app share links) names the exact place: its second half is the
  // place's CID, which the actor takes as a ?cid= link.
  const ftid = /^0x[0-9a-f]+:0x([0-9a-f]+)$/i.exec(url.searchParams.get('ftid') ?? '')?.[1];
  if (ftid) return { kind: 'url', url: `https://www.google.com/maps?cid=${BigInt(`0x${ftid}`)}` };
  // App share links often land on maps.google.com/?q=<name, address>&ftid=… (or /maps?q=…, or a
  // share.google link's google.com/search?q=<name>):
  // search for that text, which the actor resolves to the place.
  const q = url.searchParams.get('q')?.trim();
  if (q && (path === '/' || path === '/maps' || path === '/maps/' || path === '/search')) {
    return { kind: 'url', url: `https://www.google.com/maps/search/${encodeURIComponent(q)}` };
  }
  return null;
}

/**
 * Follow a short link's redirects to the Maps link behind it, or null.
 *
 * Every hop must stay on a short-link or Google host: the URL is user input,
 * and following it anywhere else would let it make this server fetch
 * arbitrary addresses.
 */
export async function expandShortLink(url: string, hops = 4): Promise<string | null> {
  let current = url;
  for (let i = 0; i < hops; i++) {
    let res: Response;
    try {
      res = await fetch(current, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8_000) });
    } catch {
      return null;
    }
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) return null;
    let next = new URL(location, current);
    // Outside some regions Google first bounces through its cookie-consent page; the real target is in ?continue=.
    if (next.hostname.toLowerCase() === 'consent.google.com') {
      const cont = next.searchParams.get('continue');
      if (!cont) return null;
      next = new URL(cont);
    }
    const host = next.hostname.toLowerCase();
    if (!SHORT_LINK_HOSTS.has(host)) {
      return GOOGLE_HOST.test(host) ? next.toString() : null;
    }
    current = next.toString();
  }
  return null;
}

/** Resolve a pasted value to a usable target, expanding short links. */
export async function resolveMapsTarget(raw: string): Promise<Exclude<MapsTarget, { kind: 'short' }> | null> {
  const target = parseMapsTarget(raw);
  if (target?.kind !== 'short') return target;
  const expanded = await expandShortLink(target.url);
  const next = expanded ? parseMapsTarget(expanded) : null;
  return next && next.kind !== 'short' ? next : null;
}
