import type { NextConfig } from "next";

// Serve under a sub-path (e.g. BASE_PATH=/agents behind nginx). Empty = root. Read at build time.
const basePath = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
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
