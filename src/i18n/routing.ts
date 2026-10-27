import { defineRouting } from 'next-intl/routing';

// Vietnamese lives at the root (/), the others under a prefix (/en, /ja).
// No detection from the browser language or a cookie: / is always Vietnamese until the visitor picks another language.
export const routing = defineRouting({
  locales: ['vi', 'en', 'ja'],
  defaultLocale: 'vi',
  localePrefix: 'as-needed',
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
