// Server-only: the origin links to this site are built from, e.g. https://review365.example.com

/**
 * SITE_URL from the env when it is set, else the request's own origin (request.url).
 * Behind Docker, request.url is the server's bind address (http://0.0.0.0:3000), so set SITE_URL there.
 */
export function publicOrigin(request: Request): string {
  const configured = process.env.SITE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // A typo (no https://, say) must not break the request: warn and use request.url.
      console.warn(`[site-url] SITE_URL is not a valid URL (${JSON.stringify(configured)}); ignoring it`);
    }
  }
  return new URL(request.url).origin;
}
