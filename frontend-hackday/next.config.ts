import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    // Detail pages (repository, finding, investigation) are still server-rendered: reuse their payload for 30s
    // when navigating back and forth. Mutations call router.refresh(), which clears this cache immediately.
    staleTimes: { dynamic: 30, static: 180 },
  },
  devIndicators: { position: "bottom-right" },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
