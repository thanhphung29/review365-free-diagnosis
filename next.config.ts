import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The report's floating share/PDF buttons sit bottom-left, where the dev indicator would cover them.
  devIndicators: { position: "bottom-right" },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
