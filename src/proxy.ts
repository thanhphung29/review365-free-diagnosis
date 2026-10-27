import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Picks the locale from the URL prefix and rewrites to /[locale] (/ is Vietnamese).
export default createMiddleware(routing);

export const config = {
  // Everything except the API, Next internals and files with an extension.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
