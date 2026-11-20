import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CLAUDE.md and AGENTS.md must stay identical, so `next dev` must not write into AGENTS.md.
  agentRules: false,
  poweredByHeader: false,
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
