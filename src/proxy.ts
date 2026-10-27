import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Picks the locale from the URL prefix and rewrites to /[locale] (/ is Vietnamese).
export default createMiddleware(routing);

export const config = {
  // Everything except the API, Next internals, files with an extension and the share images
  // (/vi/opengraph-image must be served as is, not redirected to the unprefixed path).
  matcher: '/((?!api|_next|_vercel|.*opengraph-image|.*\\..*).*)',
};
