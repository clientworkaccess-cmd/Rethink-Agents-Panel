import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CLAUDE.md and AGENTS.md must stay identical, so `next dev` must not write into AGENTS.md.
  agentRules: false,
  poweredByHeader: false,
  experimental: {
    // proxy.ts buffers request bodies (10 MB by default); dictation uploads may be up to 10 MB plus form overhead
    proxyClientMaxBodySize: "11mb",
  },
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
