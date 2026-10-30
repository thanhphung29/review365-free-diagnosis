import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /* config options here */
  // Optimize production Docker image
  output: "standalone",

  cacheComponents: true,
  partialPrefetching: true,
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
